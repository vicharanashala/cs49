# VINS-Connect — Intern FAQ Dashboard

A MERN-stack web application that serves as a centralized, searchable knowledge repository for the Vicharanashala summer internship programme. It replaces the recurring cycle of repetitive onboarding queries with a structured crowd-sourced FAQ and query resolution pipeline.

---

## 🎯 Problem It Solves

- **Time inefficiency** — The lab team spends significant time repeatedly answering the same routine queries (report submissions, platform access, stipend schedules, remote work guidelines).
- **Information asymmetry** — Interns joining in later phases lack access to information communicated to earlier batches.
- **No centralized repository** — Institutional knowledge exists only in ephemeral channels (WhatsApp, email) and disappears after resolution.
- **Recurring queries** — Without a searchable knowledge base, the same questions are answered over and over.

---

## 🏗️ System Architecture

### Modules

| Module | Description |
|---|---|
| **Verified FAQ Repository** | Centralized, searchable collection of validated answers. Instantly accessible without contacting the lab team. |
| **Raise Query Module** | Dedicated interface for interns to submit questions when no relevant FAQ exists. |
| **Resolve Query Module** | Crowdsourced resolution system where interns propose answers, which go through admin validation before becoming public. |
| **Query Tracking System** | Transparent mechanism for interns to monitor status, progress, and feedback on their submitted queries. |
| **Knowledge Retention** | Promoted resolved queries are atomically written into the FAQ repository for long-term reference. |

### How They Work Together

1. Intern searches for a query → system checks FAQ repository.
2. **Match found** → verified answer displayed instantly.
3. **No match** → intern submits query via Raise Query Module.
4. Fellow interns propose answers → status moves to `Pending Approval`.
5. Admin reviews and approves → status moves to `Resolved`.
6. Admin promotes valuable tickets → answer written into the FAQ repository.

---

## 🔄 Query State Machine (FSM)

Every query passes through exactly four states:

| State | Meaning | Trigger |
|---|---|---|
| `Open` | Query submitted, awaiting a response | Intern raises a query with no FAQ match |
| `Pending Approval` | Intern proposed a solution, hidden until verified | Intern clicks —Send for Confirmation— |
| `Resolved` | Verified response visible to all users | Admin approves intern's answer or answers directly |
| `Promoted` | Resolved answer integrated into the FAQ repository | Admin approves response for long-term reference |

---

## 🧠 CS Concepts Applied

### Finite State Machine (FSM)
Each query transitions through strictly validated states. The MongoDB schema enforces this via an enum field, separating peer suggestions from verified answers.

### Write-Through Cache
When a query is promoted by an admin, its verified response is **immediately synchronized** into the FAQ repository — ensuring future interns find the answer instantly without loading the query resolution pipeline.

### Separation of Concerns (MVC)
Each layer of the stack has a single, decoupled responsibility:

| Layer | Responsibility | Technology |
|---|---|---|
| Model | Data structure, indexes, schema validation | MongoDB + Mongoose |
| Controller | Business logic, FSM state verification | Node.js + Express |
| View | UI, interactions, form handling | React (Vite) |
| Transport | Stateless async data communication | REST API |

---

## 🛠️ Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Database | MongoDB | Flexible, indexed BSON documents for FAQ records and queries |
| ORM | Mongoose | Strict data types and middleware hook validation |
| Server | Node.js + Express | Low-latency, asynchronous request handling |
| Search | TF-IDF (Natural NLP) | Offline semantic-style keyword search via term frequency–inverse document frequency |
| Client | React (Vite) | Reactive UI with immediate local state management |
| Auth | JWT | Stateless access control mapped to roles (Intern / Admin) |
| Styling | Tailwind CSS | Atomic, maintainable utility-first CSS |

---

## 📁 Project Structure

```
query-portal-extracted/
├── public/
│   └── logo.png              # App logo
├── src/
│   ├── App.tsx               # Main app: routes, views, components
│   ├── main.tsx              # Vite entry point
│   └── index.css             # Tailwind base styles
├── server.ts                 # Express backend + API routes
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md                 # This file
```

---

## 🔌 API Reference

### Authentication
| Method | Route | Description | Access |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticate user, return JWT | Public |
| `POST` | `/api/auth/signup` | Register new intern account | Public |

### FAQs
| Method | Route | Description | Access |
|---|---|---|---|
| `GET` | `/api/faqs` | List all verified FAQs | Public |
| `GET` | `/api/faqs?q=<query>` | TF-IDF keyword + semantic search | Public |
| `GET` | `/api/faq` | List all FAQs (auth required) | Intern / Admin |
| `POST` | `/api/faq` | Manually create a FAQ entry | Admin only |

### Queries
| Method | Route | Description | Access |
|---|---|---|---|
| `POST` | `/api/queries` | Raise a new query | Intern |
| `GET` | `/api/queries/my` | Intern's own queries | Intern |
| `GET` | `/api/queries/open` | All open/escalated queries | Intern |
| `GET` | `/api/queries/pending` | Pending approval queue | Admin |
| `GET` | `/api/queries/escalated` | Escalated queries | Admin |
| `POST` | `/api/queries/:id/answers` | Propose an answer (→ Pending Approval) | Intern |
| `PATCH` | `/api/queries/:id/vote` | Upvote or downvote a query | Intern |
| `POST` | `/api/queries/:id/feedback` | Rate a query 1–5 | Intern |
| `PATCH` | `/api/queries/:id/approve` | Approve proposed answer (→ Resolved) | Admin |
| `POST` | `/api/queries/:id/promote` | Promote to FAQ repository | Admin |
| `PATCH` | `/api/queries/:id/reject` | Reject / reopen query | Admin |
| `PATCH` | `/api/queries/:id/escalate` | Toggle escalation flag | Intern / Admin |
| `POST` | `/api/queries/:id/admin-resolve` | Admin direct resolve of escalated query | Admin |

---

## 🚀 Running Locally

**Prerequisites:** Node.js, MongoDB

1. Clone / extract the project:
   ```bash
   cd query-portal-extracted
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables. Create a `.env` file:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/crowdfaq
   JWT_SECRET=your-secret-key-here
   ```

4. Start MongoDB (ensure it's running on the URI above), then start the server:
   ```bash
   npm run dev
   ```

   The app will be available at **http://localhost:3000**

5. Default seeded accounts:

   | Role | Email | Password |
   |---|---|---|
   | Admin | `admin@example.com` | `admin@123` |
   | Intern | `prasoon@example.com` | `prasoon@123` |
   | Intern | `ridha@example.com` | `ridha@123` |
   | Intern | `siddhant@example.com` | `siddhant@123` |
   | Intern | `vanisha@example.com` | `vanisha@123` |
   | Intern | `swethaa@example.com` | `swethaa@123` |
   | Intern | `ridhya@example.com` | `ridhya@123` |

---

## 📊 Data Models

### FAQ Collection
```json
{
  —question—: —What dates do I put on the NOC?—,
  —answer—: —Use the officially communicated start and end dates from your provisional offer letter.—,
  —tags—: [—noc—, —documentation—],
  —createdAt—: —2026-06-02T00:00:00.000Z—
}
```

### Query Collection
```json
{
  —questionText—: —Can I start in July if I have exams now?—,
  —status—: —open | pending_approval | resolved | promoted | escalated—,
  —proposedAnswers—: [{ —answerText—: —...—, —answeredByName—: —...—, —createdAt—: —...— }],
  —upvotes—: 0,
  —downvotes—: 0,
  —rating—: 0,
  —tags—: [—timing—],
  —createdAt—: —2026-06-02T00:00:00.000Z—
}
```

### User Collection
```json
{
  —name—: —Prasoon—,
  —email—: —prasoon@example.com—,
  —role—: —student | admin—,
  —createdAt—: —2026-06-02T00:00:00.000Z—
}
```

---

## 🔍 Search: TF-IDF vs. Hash Embeddings

The original design relied on MiniMax AI embedding vectors for semantic search. In this implementation, **TF-IDF (Term Frequency–Inverse Document Frequency)** is used instead, powered by the `natural` NLP library. It works fully offline, requires no API key, and produces meaningful relevance scores based on word overlap between the query and all FAQ questions + answers.

### Scoring Weights
- **TF-IDF corpus match** — base relevance score from the FAQ corpus
- **+2.0** per matching stemmed question word
- **+3.0** per matching tag
- **+0.5** per exact word match in the question

---

*Built for the Vicharanashala Summer Internship Programme.*
