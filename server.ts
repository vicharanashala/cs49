import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import natural from 'natural';
import { removeStopwords } from 'stopword';
import 'dotenv/config';

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const JWT_SECRET    = process.env.JWT_SECRET    || 'fallback-secret-for-dev-only-do-not-use';
const PORT          = Number(process.env.PORT)  || 3000;
const MONGO_URI     = process.env.MONGODB_URI   || 'mongodb://localhost:27017/crowdfaq';

// ─── TF-IDF SEARCH ENGINE ─────────────────────────────────────────────────────
// Replaces the broken MiniMax-embedding + cosine-similarity approach.
// TF-IDF is computed from all FAQ questions at runtime — fully offline, no API key needed.

const TfIdf    = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();
const stemmer  = natural.PorterStemmer;

let tfidfIndex: natural.TfIdf = new TfIdf();
let faqCorpus: { _id: string; question: string; answer: string; tags: string[] }[] = [];
let faqCorpusReady = false;

async function rebuildTfIdfIndex(faqs: any[]) {
  tfidfIndex  = new TfIdf();
  faqCorpus   = faqs.map(f => ({
    _id:      f._id.toString(),
    question: f.question,
    answer:   f.answer,
    tags:     f.tags || [],
  }));
  for (const faq of faqCorpus) {
    // Combine question + answer, lowercase, tokenize, stem, remove stopwords
    const text = (faq.question + ' ' + faq.answer).toLowerCase();
    const tokens = tokenizer.tokenize(text) || [];
    const cleaned = removeStopwords(tokens.map(t => stemmer.stem(t)));
    tfidfIndex.addDocument(cleaned.join(' '));
  }
  faqCorpusReady = true;
  console.log(`[TF-IDF] Indexed ${faqCorpus.length} FAQs`);
}

function tfIdfSearch(query: string, topN = 10): any[] {
  if (!faqCorpusReady || faqCorpus.length === 0) return [];

  const queryLower  = query.toLowerCase();
  const queryTokens = tokenizer.tokenize(queryLower) || [];
  const cleaned     = removeStopwords(queryTokens.map(t => stemmer.stem(t)));

  if (cleaned.length === 0) return [];

  const results: { faq: typeof faqCorpus[0]; score: number }[] = [];

  for (let i = 0; i < faqCorpus.length; i++) {
    const faq   = faqCorpus[i];
    let score   = 0;

    // TF-IDF score: how well does this FAQ's corpus match the query terms?
    tfidfIndex.tfidfs(cleaned.join(' '), (_term, measure, idx) => {
      if (idx === i) score = measure;
    });

    // Bonus: exact question-word overlap (questions are more valuable than answer text)
    const qTokens   = tokenizer.tokenize(faq.question.toLowerCase()) || [];
    const qCleaned  = removeStopwords(qTokens.map(t => stemmer.stem(t)));
    const overlap   = cleaned.filter(t => qCleaned.includes(t)).length;
    score += overlap * 2.0;   // 2× weight for question-term matches

    // Bonus: tag match
    for (const tag of faq.tags) {
      if (cleaned.includes(tag)) score += 3.0;
    }

    // Bonus: if query words appear in the question at all (not just stemmed), small boost
    const qWords = new Set(faq.question.toLowerCase().split(/\s+/));
    for (const w of queryTokens) {
      if (qWords.has(w)) score += 0.5;
    }

    if (score > 0) results.push({ faq, score });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(r => ({
      ...r.faq,
      similarity: Math.round(r.score * 100) / 100,
    }));
}

// ─── MONGOOSE SCHEMAS ─────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['student', 'admin'], default: 'student' },
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const proposedAnswerSchema = new mongoose.Schema({
  answerText:     { type: String, required: true },
  answeredBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  answeredByName: { type: String, required: true },
  createdAt:      { type: Date, default: Date.now },
}, { _id: true });

const querySchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questionText:    { type: String, required: true },
  status:          { type: String, enum: ['open', 'pending_approval', 'resolved', 'promoted', 'escalated'], default: 'open' },
  proposedAnswers: [proposedAnswerSchema],
  rating:          { type: Number, default: 0 },
  helpfulVotes:    { type: Number, default: 0 },
  upvotes:         { type: Number, default: 0 },
  downvotes:       { type: Number, default: 0 },
  escalated:       { type: Boolean, default: false },
  tags:            { type: [String], default: [] },
}, { timestamps: true });
const QueryModel = mongoose.model('Query', querySchema);

const faqSchema = new mongoose.Schema({
  question:           { type: String, required: true, trim: true },
  answer:             { type: String, required: true },
  question_embedding: { type: [Number], default: [] }, // kept for compat; no longer used
  tags:               { type: [String], default: [] },
  createdAt:          { type: Date, default: Date.now },
}, { timestamps: true });
const FAQ = mongoose.model('FAQ', faqSchema);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function promoteToFaq(query: mongoose.Document) {
  const approved = (query.toObject() as any).proposedAnswers[
    (query.toObject() as any).proposedAnswers.length - 1
  ];
  if (!approved) return;
  await FAQ.create({
    question:           query.get('questionText'),
    answer:             approved.answerText,
    question_embedding: [],
    tags:               query.get('tags') || [],
    createdAt:          new Date(),
  });
  // Rebuild TF-IDF index with the newly promoted FAQ
  const allFaqs = await FAQ.find().lean();
  await rebuildTfIdfIndex(allFaqs);
}

// ─── DB CONNECTION & SEEDING ──────────────────────────────────────────────────
async function connectDB() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB at', MONGO_URI);

  if (await User.countDocuments() === 0) {
    const users = [
      { name: 'Admin',    email: 'admin@example.com',    password: await bcrypt.hash('admin@123',   10), role: 'admin'    },
      { name: 'Prasoon',  email: 'prasoon@example.com',  password: await bcrypt.hash('prasoon@123', 10), role: 'student'  },
      { name: 'Ridha',    email: 'ridha@example.com',    password: await bcrypt.hash('ridha@123',   10), role: 'student'  },
      { name: 'Siddhant', email: 'siddhant@example.com', password: await bcrypt.hash('siddhant@123',10), role: 'student'  },
      { name: 'Vanisha',  email: 'vanisha@example.com',  password: await bcrypt.hash('vanisha@123', 10), role: 'student'  },
      { name: 'Swethaa',  email: 'swethaa@example.com',  password: await bcrypt.hash('swethaa@123', 10), role: 'student'  },
      { name: 'Ridhya',   email: 'ridhya@example.com',   password: await bcrypt.hash('ridhya@123',  10), role: 'student'  },
    ];
    await User.insertMany(users);
    console.log('Users seeded.');
  }

  if (await FAQ.countDocuments() === 0) {
    const internshipFaqs = [
      { question: 'What is the Vicharanashala internship?', answer: 'The Vicharanashala Internship is a structured learning and project-based internship focused on AI, research, innovation, teamwork, and real-world problem solving.', tags: ['about'] },
      { question: 'What is VINS?', answer: 'VINS refers to the online internship track under the Vicharanashala ecosystem.', tags: ['about'] },
      { question: 'What are the phases of VINS and what do badges mean?', answer: 'The internship has multiple phases involving coursework, collaboration, projects, and evaluations. Badges are earned by completing phase challenges.', tags: ['about'] },
      { question: 'When can I start?', answer: 'Internship start dates depend on your cohort and approved schedule. Check your offer email or official Discord announcements.', tags: ['timing'] },
      { question: 'How long is the internship?', answer: 'The typical duration is 6–8 weeks, varying slightly by cohort and learning track.', tags: ['timing'] },
      { question: 'What dates do I put on the NOC?', answer: 'Use the officially communicated start and end dates from your provisional offer letter.', tags: ['noc'] },
      { question: 'How do I know I am selected?', answer: 'You will receive an official offer letter. Your status is also updated on the portal.', tags: ['certificate'] },
      { question: 'Who do I contact for NOC submission issues?', answer: 'Reach out to admission coordinators via the official helpdesk or Discord support channel.', tags: ['noc'] },
      { question: 'How do I get my internship completion certificate?', answer: 'Certificates are auto-generated and emailed once all phases, assignments, and final project presentation are completed and evaluated.', tags: ['certificate'] },
      { question: 'Can I take leave during the internship?', answer: 'Short leaves can be coordinated with mentors. Long leaves may require extending the internship duration.', tags: ['timing'] },
      { question: 'What if my Discord invite link is expired?', answer: 'Request an updated link from the pre-arrival group or email support.', tags: ['discord'] },
      { question: 'Is attendance mandatory in all Discord voice channels?', answer: 'Mandatory sessions are explicitly marked. Team syncs are expected but peer coordination is flexible.', tags: ['discord'] },
      { question: 'What is the first step in the Learning Phase?', answer: 'Setting up your development environment and completing the introductory module on the learning portal.', tags: ['learning'] },
      { question: 'Do we work individually or in teams during the project phase?', answer: 'You are assigned to diverse teams of 3–5 interns based on complementary skills.', tags: ['about'] },
      { question: 'How will my project be evaluated?', answer: 'Projects are evaluated on technical completeness, code quality, presentation, teamwork, and innovation.', tags: ['evaluations'] },
    ];
    await FAQ.insertMany(internshipFaqs.map(f => ({ ...f, question_embedding: [], createdAt: new Date() })));
    console.log('FAQs seeded (15 default).');
  }

  // Build TF-IDF index from whatever is in the DB now
  const allFaqs = await FAQ.find().lean();
  await rebuildTfIdfIndex(allFaqs);
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
interface AuthRequest extends Request {
  user?: { id: string; name: string; role: string };
}

const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) { res.status(401).json({ error: 'Access denied, token missing' }); return; }
  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err) { res.status(403).json({ error: 'Token invalid or expired' }); return; }
    req.user = { id: decoded.id, name: decoded.name || '', role: decoded.role || 'student' };
    next();
  });
};

const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }
  next();
};

// ─── APP ──────────────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  await connectDB();

  // Health
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // ── Auth: Login
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        res.status(401).json({ error: 'Invalid credentials' }); return;
      }
      const token = jwt.sign({ id: user._id.toString(), name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
      res.json({ token, user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Auth: Signup
  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;
      if (await User.findOne({ email: email.toLowerCase() })) {
        res.status(400).json({ error: 'Email already in use' }); return;
      }
      const user = await User.create({ name, email: email.toLowerCase(), password: await bcrypt.hash(password, 10), role: 'student' });
      const token = jwt.sign({ id: user._id.toString(), name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
      res.json({ token, user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/faqs  (public — no auth required)
  //    GET /api/faqs?q=...  → TF-IDF keyword + semantic search
  app.get('/api/faqs', async (req: AuthRequest, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        const all = await FAQ.find().sort({ createdAt: -1 }).lean();
        res.json(all.map(f => ({ ...f, _id: f._id.toString(), createdAt: String(f.createdAt) })));
        return;
      }
      const results = tfIdfSearch(q);
      res.json(results);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/faq  (auth required — same TF-IDF search)
  app.get('/api/faq', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        const all = await FAQ.find().sort({ createdAt: -1 }).lean();
        res.json(all.map(f => ({ ...f, _id: f._id.toString(), createdAt: String(f.createdAt) })));
        return;
      }
      const results = tfIdfSearch(q);
      res.json(results);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/faq  (admin: manual FAQ creation)
  app.post('/api/faq', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { question, answer, tags } = req.body;
      const faq = await FAQ.create({ question, answer, tags: tags || [], question_embedding: [] });
      // Rebuild index to include the new FAQ
      const allFaqs = await FAQ.find().lean();
      await rebuildTfIdfIndex(allFaqs);
      res.status(201).json({ ...faq.toObject(), _id: faq._id.toString() });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/queries/open  (peer-resolve view)
  app.get('/api/queries/open', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const queries = await QueryModel.find({ status: { $in: ['open', 'escalated'] } })
        .populate('userId', 'name').sort({ createdAt: -1 }).lean();
      res.json(queries.map(q => flattenQuery(q)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/queries/my  (intern's own queries)
  app.get('/api/queries/my', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const queries = await QueryModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean();
      res.json(queries.map(q => flattenQuery(q)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/queries/pending  (admin approval queue)
  app.get('/api/queries/pending', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const queries = await QueryModel.find({ status: 'pending_approval' })
        .populate('userId', 'name').sort({ createdAt: -1 }).lean();
      res.json(queries.map(q => flattenQuery(q)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/queries/escalated  (admin escalated view)
  app.get('/api/queries/escalated', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const queries = await QueryModel.find({ status: 'escalated' })
        .populate('userId', 'name').sort({ createdAt: -1 }).lean();
      res.json(queries.map(q => flattenQuery(q)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/queries  (Raise a Query — Open state)
  app.post('/api/queries', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { questionText, tags } = req.body;
      if (!questionText || questionText.length < 50) {
        res.status(400).json({ error: 'Query must be at least 50 characters long.' }); return;
      }
      const existing = await QueryModel.findOne({
        questionText: { $regex: new RegExp(questionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        status: 'open',
      }).lean();
      const query = await QueryModel.create({ userId: req.user!.id, questionText, tags: tags || [] });
      res.status(201).json(flattenQuery(query.toObject(), existing?._id?.toString()));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/queries/:id/answers  (Propose Answer → Open → Pending Approval)
  app.post('/api/queries/:id/answers', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { answerText } = req.body;
      if (!answerText?.trim()) { res.status(400).json({ error: 'Answer text required' }); return; }
      const query = await QueryModel.findById(req.params.id);
      if (!query) { res.status(404).json({ error: 'Query not found' }); return; }
      query.proposedAnswers.push({
        answerText,
        answeredBy: new mongoose.Types.ObjectId(req.user!.id),
        answeredByName: req.user!.name,
        createdAt: new Date(),
      } as any);
      query.status = 'pending_approval';
      await query.save();
      const populated = await QueryModel.findById(query._id).populate('userId', 'name').lean();
      res.json(flattenQuery(populated!));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PATCH /api/queries/:id/vote  (upvote / downvote)
  app.patch('/api/queries/:id/vote', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { type } = req.body;
      if (type !== 'up' && type !== 'down') { res.status(400).json({ error: 'type must be "up" or "down"' }); return; }
      const update = type === 'up' ? { $inc: { upvotes: 1 } } : { $inc: { downvotes: 1 } };
      const query = await QueryModel.findByIdAndUpdate(req.params.id, update, { new: true })
        .populate('userId', 'name').lean();
      if (!query) { res.status(404).json({ error: 'Query not found' }); return; }
      res.json(flattenQuery(query));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PATCH /api/queries/:id/feedback  (rate 1–5)
  app.post('/api/queries/:id/feedback', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { rating } = req.body;
      if (rating !== undefined && (rating < 1 || rating > 5)) {
        res.status(400).json({ error: 'Rating must be between 1 and 5' }); return;
      }
      const query = await QueryModel.findByIdAndUpdate(
        req.params.id,
        rating !== undefined ? { rating } : {},
        { new: true }
      ).populate('userId', 'name').lean();
      if (!query) { res.status(404).json({ error: 'Query not found' }); return; }
      res.json(flattenQuery(query));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PATCH /api/queries/:id/approve  (Admin: Pending Approval → Resolved)
  app.patch('/api/queries/:id/approve', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const query = await QueryModel.findById(req.params.id);
      if (!query) { res.status(404).json({ error: 'Query not found' }); return; }
      await promoteToFaq(query);
      query.status = 'resolved';
      await query.save();
      const populated = await QueryModel.findById(query._id).populate('userId', 'name').lean();
      res.json(flattenQuery(populated!));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/queries/:id/promote  (Admin: Resolved → Promoted)
  app.post('/api/queries/:id/promote', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const query = await QueryModel.findById(req.params.id);
      if (!query) { res.status(404).json({ error: 'Query not found' }); return; }
      if (query.status !== 'resolved') { res.status(400).json({ error: 'Only resolved queries can be promoted' }); return; }
      await promoteToFaq(query);
      query.status = 'promoted';
      await query.save();
      const populated = await QueryModel.findById(query._id).populate('userId', 'name').lean();
      res.json(flattenQuery(populated!));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PATCH /api/queries/:id/reject  (Admin: Re-open query)
  app.patch('/api/queries/:id/reject', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const query = await QueryModel.findByIdAndUpdate(
        req.params.id,
        { status: 'open', $set: { proposedAnswers: [] } },
        { new: true }
      ).populate('userId', 'name').lean();
      if (!query) { res.status(404).json({ error: 'Query not found' }); return; }
      res.json(flattenQuery(query));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PATCH /api/queries/:id/escalate  (Toggle escalation)
  app.patch('/api/queries/:id/escalate', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const query = await QueryModel.findById(req.params.id);
      if (!query) { res.status(404).json({ error: 'Not found' }); return; }
      query.escalated = !query.escalated;
      query.status = query.escalated ? 'escalated' : 'open';
      await query.save();
      res.json(flattenQuery(query.toObject()));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/queries/:id/admin-resolve  (Admin direct resolve of escalated)
  app.post('/api/queries/:id/admin-resolve', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { answerText } = req.body;
      if (!answerText?.trim()) { res.status(400).json({ error: 'Answer text required' }); return; }
      const query = await QueryModel.findById(req.params.id);
      if (!query) { res.status(404).json({ error: 'Query not found' }); return; }
      query.proposedAnswers.push({
        answerText,
        answeredBy: new mongoose.Types.ObjectId(req.user!.id),
        answeredByName: req.user!.name + ' (Admin)',
        createdAt: new Date(),
      } as any);
      query.status = 'resolved';
      query.escalated = false;
      await query.save();
      const populated = await QueryModel.findById(query._id).populate('userId', 'name').lean();
      res.json(flattenQuery(populated!));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/notifications  (personalized for the logged-in user)
  app.get('/api/notifications', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user!.id);
      const isAdmin = req.user!.role === 'admin';

      const [myQueries, pendingQueries, openQueries] = await Promise.all([
        QueryModel.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
        isAdmin ? QueryModel.find({ status: 'pending_approval' }).countDocuments() : 0,
        QueryModel.find({ status: 'open' }).countDocuments(),
      ]);

      const notifications: { id: string; type: 'answer' | 'approval' | 'escalation' | 'info'; message: string; link: string; read: boolean; time: string }[] = [];

      if (isAdmin) {
        if (pendingQueries > 0) notifications.push({
          id: 'pending-admin',
          type: 'info',
          message: `${pendingQueries} query(ies) waiting for your approval`,
          link: '/approve',
          read: false,
          time: 'now',
        });
      }

      for (const q of myQueries) {
        if (q.status === 'pending_approval' && q.proposedAnswers.length > 0) {
          notifications.push({
            id: `answer-${q._id}`,
            type: 'answer',
            message: `Your query received an answer: "${q.questionText.slice(0, 50)}..."`,
            link: '/track',
            read: false,
            time: 'recently',
          });
        }
        if (q.status === 'resolved') {
          notifications.push({
            id: `resolved-${q._id}`,
            type: 'approval',
            message: `Your query was resolved: "${q.questionText.slice(0, 50)}..."`,
            link: '/track',
            read: false,
            time: 'recently',
          });
        }
      }

      const openCount = await QueryModel.countDocuments({ status: 'open' });
      if (openCount > 0) notifications.push({
        id: 'open-queries',
        type: 'info',
        message: `${openCount} open query(ies) need community answers`,
        link: '/resolve',
        read: false,
        time: 'now',
      });

      res.json(notifications.slice(0, 10));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/stats  (admin dashboard analytics)
  app.get('/api/stats', authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalQueries, openQueries, pendingQueries, resolvedQueries, promotedQueries,
        faqCount, userCount,
        queriesLastWeek,
        tagCounts,
        recentQueries,
      ] = await Promise.all([
        QueryModel.countDocuments(),
        QueryModel.countDocuments({ status: 'open' }),
        QueryModel.countDocuments({ status: 'pending_approval' }),
        QueryModel.countDocuments({ status: 'resolved' }),
        QueryModel.countDocuments({ status: 'promoted' }),
        FAQ.countDocuments(),
        User.countDocuments(),
        QueryModel.countDocuments({ createdAt: { $gte: weekAgo } }),
        QueryModel.aggregate([{ $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
        QueryModel.find().sort({ createdAt: -1 }).limit(20).select('questionText status createdAt').lean(),
      ]);

      const resolutionRate = totalQueries > 0 ? Math.round((resolvedQueries / totalQueries) * 100) : 0;
      const avgRatingResult = await QueryModel.aggregate([
        { $match: { rating: { $gt: 0 } } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]);
      const avgRating = avgRatingResult[0]?.avgRating ?? 0;

      const resolutionByDay: { date: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayStr = d.toISOString().slice(0, 10);
        const dayQueries = recentQueries.filter((q: any) =>
          q.status !== 'open' && q.createdAt?.toString().slice(0, 10) === dayStr
        );
        resolutionByDay.push({ date: dayStr, count: dayQueries.length });
      }

      res.json({
        totalQueries,
        openQueries,
        pendingQueries,
        resolvedQueries,
        promotedQueries,
        faqCount,
        userCount,
        queriesLastWeek,
        resolutionRate: Math.round(resolutionRate * 10) / 10,
        avgRating: Math.round(avgRating * 10) / 10,
        topTags: tagCounts.map((t: any) => ({ tag: t._id, count: t.count })),
        resolutionByDay,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!', details: err.message });
  });

  // ── Vite (dev) or static (prod)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(process.cwd(), 'dist', 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on http://localhost:${PORT}`));
}

// ─── SHARED HELPER ────────────────────────────────────────────────────────────
function flattenQuery(q: any, duplicateId?: string): any {
  return {
    ...q,
    _id: q._id.toString(),
    userId: q.userId?._id?.toString() || q.userId?.toString() || '',
    user: undefined,
    duplicateId,
  };
}

startServer().catch(e => console.error('Unhandled:', e));