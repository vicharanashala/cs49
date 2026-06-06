import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link, Outlet } from 'react-router-dom';
import axios from 'axios';
import { HelpCircle, FileText, CheckCircle2, MessageSquarePlus, LogOut, Loader2, Star, AlertTriangle, ArrowRight, TrendingUp, Bell } from 'lucide-react';

// --- Axios Config ---
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// --- Types & Context ---
interface User { id: string; name: string; email: string; role: string; }
interface ProposedAnswer { _id: string; answerText: string; answeredByName: string; createdAt: string; }
interface Query { _id: string; questionText: string; status: 'open' | 'pending_approval' | 'resolved' | 'promoted' | 'escalated'; proposedAnswers: ProposedAnswer[]; rating: number; helpfulVotes: number; upvotes: number; downvotes: number; escalated: boolean; createdAt: string; }
interface Faq { _id: string; question: string; answer: string; tags: string[]; similarity?: number; createdAt: string; }

interface AuthContextType {
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// --- Notifications Context ---
interface NotificationContextType {
  studentTrackNotifs: number;
  openNotifs: number;
  adminApproveNotifs: number;
  adminEscalatedNotifs: number;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

function NotificationProvider({ children }: { children: ReactNode }) {
  const [studentTrackNotifs, setStudentTrackNotifs] = useState(0);
  const [openNotifs, setOpenNotifs] = useState(0);
  const [adminApproveNotifs, setAdminApproveNotifs] = useState(0);
  const [adminEscalatedNotifs, setAdminEscalatedNotifs] = useState(0);

  const fetchCounts = async () => {
    try {
      const [myRes, openRes, pendingRes, escalatedRes] = await Promise.all([
        api.get('/queries/my'),
        api.get('/queries/open'),
        api.get('/queries/pending'),
        api.get('/queries/escalated'),
      ]);
      const myQueries = myRes.data || [];
      const unread = myQueries.filter((q: any) => q.studentRead === false).length;
      setStudentTrackNotifs(unread);
      setOpenNotifs((openRes.data || []).length);
      setAdminApproveNotifs((pendingRes.data || []).length);
      setAdminEscalatedNotifs((escalatedRes.data || []).length);
    } catch (e) {
      // ignore errors
    }
  };

  useEffect(() => {
    fetchCounts();
    const id = setInterval(fetchCounts, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <NotificationContext.Provider value={{ studentTrackNotifs, openNotifs, adminApproveNotifs, adminEscalatedNotifs, refresh: fetchCounts }}>
      {children}
    </NotificationContext.Provider>
  );
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    if (!saved || saved === 'undefined') return null;
    try { return JSON.parse(saved); } catch (e) { return null; }
  });

  const login = (newToken: string, newUser: User) => {
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };
  
  const logout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

// --- Shared UI ---
const Card = ({ children, className = '', ...props }: { children: ReactNode, className?: string, [key: string]: any }) => (
  <div {...props} className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className || ''}`}>{children}</div>
);

// --- Views ---
function Login() {
  const [email, setEmail] = useState('student@example.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 font-sans text-gray-900">
      <Card className="w-full max-w-md p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 mb-4">
            <img src="/logo.png" alt="VINS-Connect Logo" className="w-full h-full rounded-2xl object-cover shadow-sm" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">VINS-Connect Portal</h2>
          <p className="mt-2 text-sm text-gray-500">Sign in to access the community</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">{error}</div>}
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Email / Accounts</label>
             <div className="flex flex-wrap gap-2 mb-2">
               <button type="button" onClick={() => { setEmail('prasoon@example.com'); setPassword('prasoon@123'); }} className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600 hover:bg-gray-200">Prasoon</button>
               <button type="button" onClick={() => { setEmail('ridha@example.com'); setPassword('ridha@123'); }} className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600 hover:bg-gray-200">Ridha</button>
               <button type="button" onClick={() => { setEmail('siddhant@example.com'); setPassword('siddhant@123'); }} className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600 hover:bg-gray-200">Siddhant</button>
               <button type="button" onClick={() => { setEmail('vanisha@example.com'); setPassword('vanisha@123'); }} className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600 hover:bg-gray-200">Vanisha</button>
               <button type="button" onClick={() => { setEmail('swethaa@example.com'); setPassword('swethaa@123'); }} className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600 hover:bg-gray-200">Swethaa</button>
               <button type="button" onClick={() => { setEmail('ridhya@example.com'); setPassword('ridhya@123'); }} className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600 hover:bg-gray-200">Ridhya</button>
               <button type="button" onClick={() => { setEmail('admin@example.com'); setPassword('admin@123'); }} className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600 hover:bg-gray-200">Admin</button>
             </div>
             <input type="email" required className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
             <input type="password" required className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={loading} className="w-full flex justify-center rounded-xl bg-gray-900 py-3.5 font-medium text-white hover:bg-gray-800 transition-colors shadow-md mt-6">
            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Continue to Portal'}
          </button>
        </form>
      </Card>
    </div>
  );
}

function Layout() {
  const { user, logout } = useAuth();
  const notifs = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="VINS-Connect Logo" className="h-10 w-10 rounded-lg object-cover shadow-sm" />
            <span className="font-semibold text-lg tracking-tight">VINS-Connect</span>
          </Link>
          <div className="flex items-center gap-6 relative">
            <div className="hidden sm:flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
               <span className="w-2 h-2 rounded-full bg-green-500"></span>
               <span className="text-xs font-medium text-gray-600">{user?.name} ({user?.role})</span>
            </div>
            <div className="relative">
              <button onClick={() => setShowNotifs(s => !s)} className="relative p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <Bell className="w-5 h-5 text-gray-600" />
                {(notifs.openNotifs + notifs.studentTrackNotifs + notifs.adminApproveNotifs + notifs.adminEscalatedNotifs) > 0 && (
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                )}
              </button>
              {showNotifs && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 z-30">
                  <div className="p-3">
                    <div className="text-sm font-medium text-gray-700 mb-2">Notifications</div>
                    <div className="space-y-2">
                      {notifs.studentTrackNotifs > 0 && <Link to="/track" onClick={() => setShowNotifs(false)} className="block text-sm text-gray-700 hover:bg-gray-50 rounded-md p-2">You have {notifs.studentTrackNotifs} query updates</Link>}
                      {notifs.openNotifs > 0 && <Link to="/resolve" onClick={() => setShowNotifs(false)} className="block text-sm text-gray-700 hover:bg-gray-50 rounded-md p-2">{notifs.openNotifs} queries waiting to be resolved</Link>}
                      {notifs.adminApproveNotifs > 0 && <Link to="/approve" onClick={() => setShowNotifs(false)} className="block text-sm text-gray-700 hover:bg-gray-50 rounded-md p-2">{notifs.adminApproveNotifs} answers awaiting approval</Link>}
                      {notifs.adminEscalatedNotifs > 0 && <Link to="/escalated" onClick={() => setShowNotifs(false)} className="block text-sm text-gray-700 hover:bg-gray-50 rounded-md p-2">{notifs.adminEscalatedNotifs} escalated queries</Link>}
                      {(notifs.studentTrackNotifs + notifs.openNotifs + notifs.adminApproveNotifs + notifs.adminEscalatedNotifs) === 0 && (
                        <div className="text-sm text-gray-400">No new notifications</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button onClick={logout} className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 text-sm font-medium">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

function Dashboard() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Faq[] | null>(null);
  const [searching, setSearching] = useState(false);
  const { user } = useAuth();
  const notifs = useNotifications();

  useEffect(() => {
    api.get('/faqs').then(res => setFaqs(res.data)).catch(console.error);
  }, []);

  const handleDashboardSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await api.get<Faq[]>(`/faqs?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data);
    } catch { setSearchResults(null); }
    finally { setSearching(false); }
  };

  return (
    <div className="space-y-12">
       <section>
          <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-6">Welcome to the Community</h2>
          {/* FAQ Search Bar */}
          <div className="mb-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Search verified FAQs with AI..."
                value={searchQuery}
                onChange={(e) => handleDashboardSearch(e.target.value)}
                className="w-full rounded-2xl bg-white border border-gray-200 px-5 py-3.5 pr-12 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
              />
              {searching && <Loader2 className="absolute right-4 top-3.5 w-5 h-5 animate-spin text-gray-400" />}
            </div>
            {searchResults !== null && (
              <div className="mt-3 space-y-3">
                {searchResults.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                    <p className="text-gray-500 font-medium mb-2">No FAQ found for "{searchQuery}"</p>
                    <Link to="/raise" className="text-blue-600 text-sm font-semibold hover:underline">Raise a new query instead →</Link>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                    {searchResults.slice(0, 5).map(faq => (
                      <div key={faq._id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 text-sm">{faq.question}</h4>
                            <p className="text-gray-600 text-sm mt-1 line-clamp-2">{faq.answer}</p>
                            {faq.similarity !== undefined && <span className="text-[10px] text-blue-500 font-medium mt-1 inline-block">✨ {Math.round(faq.similarity * 100)}% match</span>}
                          </div>
                          <Link to="/faqs" className="shrink-0 text-xs text-blue-600 font-semibold hover:underline">View</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <Link to="/raise">
               <Card className="p-6 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer h-full group">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"><MessageSquarePlus className="w-6 h-6" /></div>
                  <h3 className="text-lg font-semibold mb-2">Raise a Query</h3>
                  <p className="text-sm text-gray-500">Ask the community for help and get verified answers from peers and admins.</p>
               </Card>
             </Link>
             <Link to="/resolve">
               <Card className="relative p-6 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer h-full group">
                 {notifs.openNotifs > 0 && <div className="absolute top-3 right-3"><span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-semibold bg-red-600 text-white">{notifs.openNotifs}</span></div>}
                  <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"><CheckCircle2 className="w-6 h-6" /></div>
                  <h3 className="text-lg font-semibold mb-2">Resolve Queries</h3>
                  <p className="text-sm text-gray-500">Share your knowledge by answering open queries from fellow students.</p>
               </Card>
             </Link>
             <Link to="/track">
               <Card className="relative p-6 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer h-full group">
                 {notifs.studentTrackNotifs > 0 && <div className="absolute top-3 right-3"><span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-semibold bg-red-600 text-white">{notifs.studentTrackNotifs}</span></div>}
                  <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"><TrendingUp className="w-6 h-6" /></div>
                  <h3 className="text-lg font-semibold mb-2">Track Query</h3>
                  <p className="text-sm text-gray-500">Check the status of your queries, provide feedback, or escalate issues.</p>
               </Card>
             </Link>
             {user?.role === 'admin' && (
               <>
                 <Link to="/approve">
                   <Card className="relative p-6 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer h-full group border-l-4 border-l-yellow-500">
                     {notifs.adminApproveNotifs > 0 && <div className="absolute top-3 right-3"><span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-semibold bg-yellow-600 text-white">{notifs.adminApproveNotifs}</span></div>}
                      <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"><AlertTriangle className="w-6 h-6" /></div>
                      <h3 className="text-lg font-semibold mb-2">Approve Answers</h3>
                      <p className="text-sm text-gray-500">Review and approve community answers to make them available.</p>
                   </Card>
                 </Link>
                 <Link to="/escalated">
                   <Card className="relative p-6 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer h-full group border-l-4 border-l-red-500">
                     {notifs.adminEscalatedNotifs > 0 && <div className="absolute top-3 right-3"><span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-semibold bg-red-600 text-white">{notifs.adminEscalatedNotifs}</span></div>}
                      <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"><AlertTriangle className="w-6 h-6" /></div>
                      <h3 className="text-lg font-semibold mb-2">Escalated Queries</h3>
                      <p className="text-sm text-gray-500">View and resolve queries that have been escalated to admins.</p>
                   </Card>
                 </Link>
               </>
             )}
          </div>
       </section>
       
       <section>
          <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
            <h3 className="text-xl font-semibold tracking-tight text-gray-900">Verified FAQs</h3>
            <Link to="/faqs" className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1">
              View all {faqs.length} FAQs <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid gap-4">
             {faqs.slice(0, 3).map(faq => (
                <Card key={faq._id} className="p-6 border-l-4 border-l-green-500">
                   <h4 className="font-semibold text-lg mb-3">{faq.question}</h4>
                   <p className="text-gray-600 leading-relaxed mb-4">{faq.answer}</p>
                   <div className="flex flex-wrap gap-2">
                     {faq.tags?.map(t => <span key={t} className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">#{t}</span>)}
                   </div>
                </Card>
             ))}
             {faqs.length === 0 && <div className="text-center py-12 text-gray-400">No FAQs available yet.</div>}
          </div>
       </section>
    </div>
  );
}

function RaiseQuery() {
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const minChars = 50;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.length < minChars) return;
    setSubmitting(true);
    try {
      await api.post('/queries', { questionText: question });
      setSuccess(true);
      setQuestion('');
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="mb-6 flex items-center gap-3">
         <Link to="/" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowRight className="w-5 h-5 rotate-180" /></Link>
         <h2 className="text-2xl font-semibold tracking-tight">Raise a New Query</h2>
      </div>
      <Card className="p-8">
        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100"><CheckCircle2 className="w-8 h-8" /></div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">Query Submitted Successfully</h3>
            <p className="text-gray-500 mb-6">Your peers and admins will review it shortly. You can track its status in the dashboard.</p>
            <button onClick={() => setSuccess(false)} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-medium transition-colors">Ask Another Question</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">Describe your issue or question in detail</label>
               <textarea 
                 rows={6}
                 value={question}
                 onChange={(e) => setQuestion(e.target.value)}
                 className="w-full rounded-2xl bg-gray-50 border border-gray-200 p-4 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all resize-none text-gray-800"
                 placeholder="I'm having trouble understanding how to..."
               />
               <div className="flex justify-between mt-2">
                 <span className={`text-xs font-medium ${question.length < minChars ? 'text-red-500' : 'text-green-600'}`}>
                   {question.length} / {minChars} minimum characters required
                 </span>
                 <span className="text-xs text-gray-400">{question.length} chars</span>
               </div>
            </div>
            <button 
              type="submit" 
              disabled={submitting || question.length < minChars} 
              className="w-full flex justify-center rounded-xl bg-gray-900 py-3.5 font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {submitting ? <Loader2 className="animate-spin h-5 w-5" /> : 'Submit Query'}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}

function ResolveQuery() {
  const [queries, setQueries] = useState<Query[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchOpenQueries();
  }, []);

  const fetchOpenQueries = () => api.get('/queries/open').then(res => setQueries(res.data)).catch(console.error);

  const activeQuery = queries.find(q => q._id === selectedId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !answer.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/queries/${selectedId}/answers`, { answerText: answer });
      setAnswer('');
      setSelectedId('');
      fetchOpenQueries();
      alert("Answer submitted successfully!");
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (id: string, type: 'up' | 'down') => {
    try {
      await api.patch(`/queries/${id}/vote`, { type });
      fetchOpenQueries();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="mb-6 flex items-center gap-3">
         <Link to="/" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowRight className="w-5 h-5 rotate-180" /></Link>
         <h2 className="text-2xl font-semibold tracking-tight">Resolve Queries</h2>
      </div>
      <div className="grid md:grid-cols-5 gap-8">
         <div className="md:col-span-2 space-y-4">
            <h3 className="font-medium text-gray-900">Open Queries ({queries.length})</h3>
            <div className="space-y-3 h-[500px] overflow-y-auto pr-2">
               {queries.map(q => (
                 <div 
                   key={q._id} 
                   onClick={() => setSelectedId(q._id)}
                   className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedId === q._id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                 >
                   <div className="flex items-center gap-2 mb-2">
                     {q.escalated ? <span className="bg-red-100 text-red-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">Escalated</span> : <span className="bg-green-100 text-green-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">Open</span>}
                   </div>
                   <p className="text-sm font-medium text-gray-800 line-clamp-3">{q.questionText}</p>
                 </div>
               ))}
               {queries.length === 0 && <div className="text-gray-400 text-sm py-4">No open queries to resolve.</div>}
            </div>
         </div>
         <div className="md:col-span-3">
            {activeQuery ? (
              <Card className="p-6">
                 <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Question Details</h4>
                    <p className="text-gray-900 font-medium leading-relaxed">{activeQuery.questionText}</p>
                    <div className="mt-4 text-xs text-gray-400 font-mono">ID: {activeQuery._id.substring(activeQuery._id.length - 8)}</div>
                 </div>
                 
                 <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Your Proposed Answer</label>
                      <textarea 
                        rows={6} required
                        value={answer} onChange={e => setAnswer(e.target.value)}
                        className="w-full rounded-xl bg-white border border-gray-200 p-4 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all resize-none shadow-sm"
                        placeholder="Provide a clear, helpful resolution..."
                      />
                    </div>
                    {/* Voting + Tag Search */}
                    <div>
                       <div className="flex items-center justify-between mb-2">
                         <label className="block text-sm font-medium text-gray-700">This query is useful</label>
                         <div className="flex gap-2">
                           <button type="button" onClick={() => handleVote(activeQuery._id, 'up')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 border border-green-100 transition-colors">
                             <TrendingUp className="w-3.5 h-3.5"/> Helpful ({activeQuery.upvotes || 0})
                           </button>
                           <button type="button" onClick={() => handleVote(activeQuery._id, 'down')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 border border-red-100 transition-colors">
                             <AlertTriangle className="w-3.5 h-3.5"/> Not helpful ({activeQuery.downvotes || 0})
                           </button>
                         </div>
                       </div>
                    </div>
                    <button type="submit" disabled={submitting} className="w-full rounded-xl bg-gray-900 py-3 font-medium text-white hover:bg-gray-800 transition-colors shadow-sm mt-4">
                       {submitting ? <Loader2 className="animate-spin h-5 w-5 mx-auto" /> : 'Submit Resolution'}
                    </button>
                 </form>
              </Card>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                 <FileText className="w-12 h-12 text-gray-300 mb-4" />
                 <p className="font-medium text-gray-500">Select a query from the list to provide an answer</p>
              </div>
            )}
         </div>
      </div>
    </div>
  );
}

function TrackQuery() {
  const [queries, setQueries] = useState<Query[]>([]);
  const { refresh } = useNotifications();

  useEffect(() => {
    fetchMyQueries();
  }, []);

  const fetchMyQueries = async () => {
    try {
      const res = await api.get('/queries/my');
      const my = res.data || [];
      // mark any unread queries as read
      const unread = my.filter((q: any) => q.studentRead === false);
      if (unread.length > 0) {
        await Promise.all(unread.map((q: any) => api.patch(`/queries/${q._id}/read`).catch(() => {})));
        // refresh notification counts
        try { refresh(); } catch (e) { /* ignore */ }
      }
      setQueries(my);
    } catch (e) { console.error(e); }
  };

  const handleEscalate = async (id: string, currentlyEscalated: boolean) => {
    try {
      await api.patch(`/queries/${id}/escalate`);
      fetchMyQueries();
    } catch (e) { console.error(e); }
  };

  const handleRating = async (id: string, rating: number) => {
    try {
      await api.post(`/queries/${id}/feedback`, { rating });
      fetchMyQueries();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="mb-8 flex items-center gap-3">
         <Link to="/" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowRight className="w-5 h-5 rotate-180" /></Link>
         <h2 className="text-2xl font-semibold tracking-tight">Track Your Queries</h2>
      </div>
      <div className="space-y-6">
        {queries.length === 0 && <div className="text-gray-500 bg-white p-12 text-center rounded-2xl border border-gray-200 shadow-sm font-medium">You haven't asked any questions yet.</div>}
        {queries.map(q => (
          <Card key={q._id} className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
               <div className="flex-1">
                 <div className="flex flex-wrap items-center gap-3 mb-4">
                   {q.status === 'promoted' && <span className="bg-indigo-100 text-indigo-700 text-xs uppercase font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Promoted to FAQ</span>}
                   {q.status === 'resolved' && <span className="bg-blue-100 text-blue-700 text-xs uppercase font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Resolved (Admin Approved)</span>}
                   {q.status === 'pending_approval' && <span className="bg-yellow-100 text-yellow-700 text-xs uppercase font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Pending Admin Approval</span>}
                   {q.status === 'escalated' && <span className="bg-red-100 text-red-700 text-xs uppercase font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Escalated</span>}
                   {q.status === 'open' && <span className="bg-green-100 text-green-700 text-xs uppercase font-bold px-2.5 py-1 rounded-full">Open</span>}
                   <span className="text-xs font-mono text-gray-400">{new Date(q.createdAt).toLocaleDateString()}</span>
                 </div>
                 <h3 className="text-lg font-semibold text-gray-900 leading-snug mb-6">{q.questionText}</h3>
                 
                 <div className="space-y-4">
                   {q.proposedAnswers.length > 0 ? (
                     q.proposedAnswers.map((pa, idx) => (
                       <div key={pa._id || idx} className={`bg-gray-50 p-5 rounded-xl border ${q.status === 'resolved' ? 'border-green-200 bg-green-50/30' : 'border-gray-100'}`}>
                         <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-500 uppercase">Answered by {pa.answeredByName}</span>
                              {q.status === 'resolved' && (
                                <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3"/> Admin Approved
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400">{new Date(pa.createdAt).toLocaleDateString()}</span>
                         </div>
                         <p className="text-gray-800 text-sm leading-relaxed">{pa.answerText}</p>
                       </div>
                     ))
                   ) : (
                     <div className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-gray-100">Awaiting answers from the community.</div>
                   )}
                 </div>
               </div>
               
               <div className="md:w-64 shrink-0 flex flex-col gap-4 bg-gray-50 p-5 rounded-xl border border-gray-100 h-full">
                  <div>
                    <span className="block text-xs font-bold text-gray-500 uppercase mb-2">Rate Resolution</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} onClick={() => handleRating(q._id, star)} className="focus:outline-none transition-transform hover:scale-110">
                           <Star className={`w-6 h-6 ${star <= q.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 hover:text-yellow-200'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-gray-200 my-2"></div>
                  <div>
                    <span className="block text-xs font-bold text-gray-500 uppercase mb-2">Still facing issues?</span>
                    <button 
                      onClick={() => handleEscalate(q._id, q.escalated)}
                      className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition-colors border ${q.escalated ? 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}
                    >
                      {q.escalated ? 'De-escalate Query' : 'Escalate to Admin'}
                    </button>
                  </div>
               </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ApproveQuery() {
  const [queries, setQueries] = useState<Query[]>([]);
  const { user } = useAuth();

  const fetchPending = () => api.get('/queries/pending').then(res => setQueries(res.data)).catch(console.error);

  useEffect(() => {
    fetchPending();
  }, []);

  if (user?.role !== 'admin') return <div className="p-12 text-center text-red-500 font-medium">Access Denied. Admins only.</div>;

  const handleApprove = async (id: string) => {
    try {
      await api.patch(`/queries/${id}/approve`);
      fetchPending();
      alert("Answer approved and promoted to FAQ!");
    } catch (e) { console.error(e); }
  };

  const handlePromote = async (id: string) => {
    try {
      await api.post(`/queries/${id}/promote`);
      fetchPending();
      alert("Query promoted to FAQ repository.");
    } catch (e) { console.error(e); }
  };

  const handleReject = async (id: string) => {
    try {
      await api.patch(`/queries/${id}/reject`);
      fetchPending();
      alert("Answer rejected and query re-opened.");
    } catch (e) { console.error(e); }
  };

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="mb-6 flex items-center gap-3">
         <Link to="/" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowRight className="w-5 h-5 rotate-180" /></Link>
         <h2 className="text-2xl font-semibold tracking-tight">Approve Answers</h2>
      </div>
      <div className="space-y-6">
        {queries.length === 0 && <div className="text-gray-500 bg-white p-12 text-center rounded-2xl border border-gray-200 shadow-sm font-medium">No pending approvals.</div>}
        {queries.map(q => {
          const lastAnswer = q.proposedAnswers[q.proposedAnswers.length - 1];
          return (
            <Card key={q._id} className="p-6 md:p-8">
               <div className="mb-6">
                 <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Original Question</span>
                 <p className="font-semibold text-gray-900 text-lg leading-snug">{q.questionText}</p>
                 <div className="mt-2 text-[10px] text-gray-400 font-mono">Asked on {new Date(q.createdAt).toLocaleDateString()}</div>
               </div>
               {lastAnswer && (
                 <div className="bg-gray-50 p-5 border border-gray-100 rounded-xl mb-6">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-gray-500 uppercase">Proposed Answer by {lastAnswer.answeredByName}</span>
                      <span className="text-[10px] text-gray-400">{new Date(lastAnswer.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-gray-800 text-sm leading-relaxed">{lastAnswer.answerText}</p>
                 </div>
               )}
               <div className="flex flex-col sm:flex-row gap-3">
                 <button onClick={() => handleApprove(q._id)} className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors shadow-sm">
                   Approve & Promote to FAQ
                 </button>
                 <button onClick={() => handleReject(q._id)} className="flex-1 py-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors">
                   Reject & Re-open
                 </button>
               </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EscalatedQueries() {
  const [queries, setQueries] = useState<Query[]>([]);
  const [adminAnswer, setAdminAnswer] = useState<{ [key: string]: string }>({});
  const { user } = useAuth();

  const fetchEscalated = () => api.get('/queries/escalated').then(res => setQueries(res.data)).catch(console.error);

  useEffect(() => {
    fetchEscalated();
  }, []);

  if (user?.role !== 'admin') return <div className="p-12 text-center text-red-500 font-medium">Access Denied. Admins only.</div>;

  const handleResolve = async (id: string) => {
    const text = adminAnswer[id];
    if (!text?.trim()) return;
    try {
      await api.post(`/queries/${id}/admin-resolve`, { answerText: text });
      fetchEscalated();
      setAdminAnswer(prev => ({ ...prev, [id]: '' }));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="mb-6 flex items-center gap-3">
         <Link to="/" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowRight className="w-5 h-5 rotate-180" /></Link>
         <h2 className="text-2xl font-semibold tracking-tight">Escalated Queries</h2>
      </div>
      <div className="space-y-6">
        {queries.length === 0 && <div className="text-gray-500 bg-white p-12 text-center rounded-2xl border border-gray-200 shadow-sm font-medium">No escalated queries at the moment.</div>}
        {queries.map(q => (
          <Card key={q._id} className="p-6 md:p-8 border-l-4 border-red-500">
             <div className="mb-6">
               <span className="bg-red-100 text-red-700 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full mb-3 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Escalated</span>
               <p className="font-semibold text-gray-900 text-lg leading-snug mb-2">{q.questionText}</p>
               <div className="text-[10px] text-gray-400 font-mono">Asked on {new Date(q.createdAt).toLocaleDateString()}</div>
             </div>
             {q.proposedAnswers.length > 0 && (
               <div className="mb-6 space-y-3">
                 <h4 className="text-xs font-bold text-gray-500 uppercase">Previous Answers</h4>
                 {q.proposedAnswers.map((pa, idx) => (
                   <div key={idx} className="bg-gray-50 p-4 border border-gray-100 rounded-xl">
                      <span className="text-xs font-bold text-gray-400 block mb-1">By {pa.answeredByName}</span>
                      <p className="text-gray-700 text-sm max-h-40 overflow-y-auto">{pa.answerText}</p>
                   </div>
                 ))}
               </div>
             )}
             <div className="bg-red-50/50 p-5 rounded-xl border border-red-100">
               <label className="block text-sm font-medium text-red-800 mb-2">Admin Resolution</label>
               <textarea 
                 rows={4}
                 className="w-full rounded-xl bg-white border border-red-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3 resize-none"
                 placeholder="Provide final resolution as admin..."
                 value={adminAnswer[q._id] || ''}
                 onChange={(e) => setAdminAnswer({ ...adminAnswer, [q._id]: e.target.value })}
               />
               <button 
                 onClick={() => handleResolve(q._id)} 
                 disabled={!adminAnswer[q._id]?.trim()}
                 className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
               >
                 Submit Final Resolution
               </button>
             </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AllFaqs() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.get('/faqs').then(res => setFaqs(res.data)).catch(console.error);
  }, []);

  const handleSearch = async (q: string) => {
    setSearchTerm(q);
    if (!q.trim()) { api.get('/faqs').then(res => setFaqs(res.data)).catch(console.error); return; }
    setSearching(true);
    try { const res = await api.get<Faq[]>(`/faqs?q=${encodeURIComponent(q)}`); setFaqs(res.data); } catch { /* fallback to local filter */ }
    finally { setSearching(false); }
  };

  const allTags: string[] = [...new Set<string>(faqs.flatMap(f => (f.tags || []) as string[]))].sort();

  const filteredFaqs = faqs.filter(f => {
    if (!searchTerm.trim()) return selectedCategory === 'All' || (f.tags && f.tags.includes(selectedCategory));
    return selectedCategory === 'All' || (f.tags && f.tags.includes(selectedCategory));
  });

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
         <div className="flex items-center gap-3">
            <Link to="/" className="text-gray-400 hover:text-gray-900 transition-colors"><ArrowRight className="w-5 h-5 rotate-180" /></Link>
            <h2 className="text-2xl font-semibold tracking-tight">All Verified FAQs</h2>
         </div>
         <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
           <select 
             value={selectedCategory}
             onChange={(e) => setSelectedCategory(e.target.value)}
             className="px-4 py-2 border border-gray-300 rounded-xl w-full sm:w-48 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
           >
             <option value="All">All Categories</option>
             {allTags.map(tag => (
               <option key={tag} value={tag}>{tag.charAt(0).toUpperCase() + tag.slice(1)}</option>
             ))}
           </select>
           <input 
             type="text" 
             placeholder="Semantic search..."
             value={searchTerm}
             onChange={(e) => handleSearch(e.target.value)}
             className="px-4 py-2 border border-gray-300 rounded-xl w-full sm:w-64 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
           />
           {searching && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
         </div>
      </div>
      <div className="grid gap-6">
         {filteredFaqs.length === 0 && <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border border-gray-200">No FAQs found matching your criteria.</div>}
         {filteredFaqs.map(faq => (
            <Card key={faq._id} className="p-6 md:p-8 border-l-4 border-l-green-500">
               <h4 className="font-semibold text-lg md:text-xl mb-3 text-gray-900">{faq.question}</h4>
               <p className="text-gray-700 leading-relaxed mb-4">{faq.answer}</p>
               <div className="flex flex-wrap gap-2">
                 {faq.tags?.map(t => <span key={t} className="text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full uppercase tracking-wider">#{t}</span>)}
               </div>
            </Card>
         ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NotificationProvider>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
             <Route index element={<Dashboard />} />
             <Route path="faqs" element={<AllFaqs />} />
             <Route path="raise" element={<RaiseQuery />} />
             <Route path="resolve" element={<ResolveQuery />} />
             <Route path="track" element={<TrackQuery />} />
             <Route path="approve" element={<ApproveQuery />} />
             <Route path="escalated" element={<EscalatedQueries />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </NotificationProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
