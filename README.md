# TaskFlow — Collaborative Project Management Platform

TaskFlow is a modern, production-minded collaborative project management web application inspired by Trello and Asana. It provides teams with a visual workspace to organize projects, track tasks across interactive Kanban boards, assign responsibilities, communicate in real time, and manage team workflows effectively.

---

## 1. Project Overview & Vision

TaskFlow is designed to solve common collaboration challenges for modern software and product teams:
- **Visual Workflows**: Manage tasks across customizable status columns (`To Do`, `In Progress`, `Under Review`, `Done`).
- **Team Coordination**: Organize projects into team workspaces, invite members, and assign role-based permissions (`Owner`, `Admin`, `Member`, `Viewer`).
- **Contextual Communication**: Discuss implementation details directly within task cards through real-time threaded comments.
- **Accountability & Tracking**: Set priorities (`Low`, `Medium`, `High`, `Urgent`), deadlines, and assignees with clear visibility.
- **Enterprise-Grade Security**: Secure JWT authentication, salted bcrypt password hashing, rigorous input validation, and route-level authorization.

---

## 2. Technology Stack & Rationale

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | React 18+ with Vite | Rapid Hot-Module Replacement (HMR), component-driven architecture, and lightweight client-side routing. |
| **Styling** | Tailwind CSS | Utility-first styling enabling a clean, responsive, modern UI with consistent spacing, typography, and color tokens. |
| **Backend** | Node.js & Express.js | High-performance, event-driven RESTful API service with rich middleware ecosystem. |
| **Database** | MongoDB & Mongoose | Flexible document database ideal for hierarchical project, task, and comment schemas with schema-level validation. |
| **Authentication** | JWT & bcrypt | Stateless token-based authentication with cryptographically salted password hashing. |
| **Real-Time** | Socket.IO *(Later Phase)* | Low-latency bi-directional event communication for live board sync and instant notifications. |
| **Language** | JavaScript (ES Modules) | Single language across the entire stack for consistency and code clarity. |

---

## 3. System Architecture & Interaction Flow

```
+-------------------------------------------------------------------------+
|                           CLIENT (Frontend)                             |
|      React 18 + Vite | Tailwind CSS | React Router | Context API        |
+-------------------------------------------------------------------------+
                                    |
                    HTTPS / JSON (REST API) + WebSocket
                                    |
                                    v
+-------------------------------------------------------------------------+
|                           SERVER (Backend)                              |
|                    Node.js + Express REST API                           |
|                                                                         |
|  [ CORS & Security Headers ] -> [ Rate Limiting & Request Sanitizer ]   |
|                                 |                                       |
|  [ Auth Middleware (JWT) ]   -> [ Controller Logic ]                    |
|                                 |                                       |
|  [ Mongoose ODM Layer ]      -> [ Error Handling Middleware ]           |
+-------------------------------------------------------------------------+
                                    |
                          Mongoose ODM Driver
                                    |
                                    v
+-------------------------------------------------------------------------+
|                           DATABASE                                      |
|                       MongoDB Database                                  |
|         Collections: users | projects | tasks | comments                |
+-------------------------------------------------------------------------+
```

### How Components Interact:
1. **User Authentication Flow**:
   - The user submits registration or login credentials via the React frontend.
   - The Express backend validates the payload, checks for uniqueness, verifies passwords with `bcrypt`, and generates a signed JWT token containing the user's ID.
   - The frontend stores the token securely in memory/HTTP-only mechanisms and attaches it as an `Authorization: Bearer <token>` header to all subsequent API requests.

2. **Project & Task Data Flow**:
   - The client requests project boards or task lists from Express routes.
   - Protected Express routes run an `authMiddleware` that decodes and validates the JWT, attaching the authenticated user object to `req.user`.
   - The controller checks whether the authenticated user is an authorized member or owner of the target project before querying MongoDB via Mongoose.
   - Mongoose fetches or updates the relevant documents and returns standardized JSON responses to the frontend.

3. **Real-Time Synchronization Flow (Phase 8)**:
   - When a user updates a task status or leaves a comment, an HTTP mutation updates MongoDB.
   - The backend triggers a Socket.IO event to the project's dedicated room (`project:<projectId>`).
   - All active team members on that board receive the live event and update their local state without needing a page refresh.

---

## 4. Database Entities & Initial Relationships

TaskFlow is modeled around 4 core entities: **User**, **Project**, **Task**, and **Comment**.

```
+----------------+          1 : N          +-----------------+
|      User      | <---------------------> |     Project     |
|----------------|                         |-----------------|
| _id            |                         | _id             |
| name           | 1                       | title           |
| email          | :                       | description     |
| passwordHash   | N (Created / Assigned)  | ownerId (User)  |
| avatarUrl      |                         | members: [      |
| createdAt      |                         |   { user, role }|
+----------------+                         | ]               |
        |                                  | createdAt       |
        |                                  +-----------------+
        | 1 : N                                     |
        | (Authored)                                | 1 : N
        v                                           v
+----------------+          1 : N          +-----------------+
|    Comment     | <---------------------- |      Task       |
|----------------|                         |-----------------|
| _id            |                         | _id             |
| taskId (Task)  |                         | projectId       |
| authorId (User)|                         | title           |
| content        |                         | description     |
| createdAt      |                         | status          |
+----------------+                         | priority        |
                                           | dueDate         |
                                           | assigneeId(User)|
                                           | order           |
                                           | createdAt       |
                                           +-----------------+
```

### Entity Schemas & Fields:

#### 1. User
- `_id`: ObjectId (Primary Key)
- `name`: String (Required, trimmed, min 2 chars)
- `email`: String (Required, unique, lowercase, trimmed, validated email format)
- `password`: String (Hashed with bcrypt salt rounds >= 10, never selected by default)
- `avatar`: String (Optional URL or initials avatar generator)
- `createdAt`: Date / Timestamps

#### 2. Project
- `_id`: ObjectId (Primary Key)
- `title`: String (Required, trimmed, max 100 chars)
- `description`: String (Optional, max 500 chars)
- `owner`: ObjectId (References `User`, required)
- `members`: Array of objects:
  - `user`: ObjectId (References `User`)
  - `role`: Enum (`'owner'`, `'admin'`, `'member'`, `'viewer'`)
- `columns`: Array of strings defining custom board states (Default: `['To Do', 'In Progress', 'Under Review', 'Done']`)
- `createdAt` & `updatedAt`: Timestamps

#### 3. Task
- `_id`: ObjectId (Primary Key)
- `project`: ObjectId (References `Project`, required, indexed)
- `title`: String (Required, trimmed, max 150 chars)
- `description`: String (Optional markdown/text)
- `status`: String (Must match one of the project's columns, default `'To Do'`)
- `priority`: Enum (`'low'`, `'medium'`, `'high'`, `'urgent'`, default `'medium'`)
- `dueDate`: Date (Optional)
- `assignee`: ObjectId (References `User`, optional)
- `creator`: ObjectId (References `User`, required)
- `order`: Number (Position index within the column for drag-and-drop sequencing)
- `createdAt` & `updatedAt`: Timestamps

#### 4. Comment
- `_id`: ObjectId (Primary Key)
- `task`: ObjectId (References `Task`, required, indexed)
- `author`: ObjectId (References `User`, required)
- `content`: String (Required, trimmed, max 1000 chars)
- `createdAt` & `updatedAt`: Timestamps

---

## 5. Security Architecture & Considerations

Security is built into the architecture from day one:

1. **Password Hashing**:
   - Passwords are never stored in plain text.
   - Hashed using `bcrypt` (or `bcryptjs`) with a cost factor of at least 10 before saving to MongoDB via Mongoose pre-save hooks.
   - User queries exclude the password hash by default (`select: false`).

2. **Environment Variable Isolation**:
   - All sensitive configurations (`PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`) are isolated in `.env` files.
   - `.env` is explicitly ignored in `.gitignore`. Only `.env.example` with non-sensitive placeholder values is committed.

3. **Input Validation & Sanitization**:
   - All incoming API requests are validated (types, formats, string length limits).
   - Email format is sanitized and normalized to lowercase.
   - MongoDB injection prevention via Mongoose schema casting and sanitization middleware.

4. **Authorization & Access Control**:
   - Authentication verifies **who you are** via JWT.
   - Authorization verifies **what you can do**. Every request to view, edit, or delete a project, task, or comment checks that the authenticated user is a verified project member with adequate permissions (e.g., only project owners/admins can delete projects or remove members).

5. **CORS & Rate Limiting**:
   - Express backend will restrict CORS headers strictly to the configured `CLIENT_URL`.
   - Rate limiting middleware will protect authentication routes (`/api/auth/login`, `/api/auth/register`) from brute-force attempts.

---

## 6. Project Directory Structure

```
project-management-tool/
├── .env.example               # Root environment variable template
├── .gitignore                  # Git ignore rules for node_modules, build, env
├── package.json               # Root package manifest with workspace helper scripts
├── README.md                  # Comprehensive architectural and project guide
├── client/                    # Frontend React + Vite Application
│   ├── public/                # Static assets (favicons, icons)
│   └── src/
│       ├── assets/            # Images, SVGs, styles
│       ├── components/        # Reusable UI components (Navbar, Modal, TaskCard)
│       ├── context/           # React Context providers (AuthContext, ProjectContext)
│       ├── hooks/             # Custom React hooks (useAuth, useTasks)
│       ├── pages/             # Page views (Login, Register, Dashboard, BoardView)
│       ├── services/          # HTTP API client services (api.js, authService.js)
│       └── utils/             # Helper functions, formatters, constants
└── server/                    # Backend Node.js + Express API
    ├── .env.example           # Server-specific environment template
    ├── package.json           # Backend package manifest and scripts
    └── src/
        ├── config/            # DB connection, third-party configurations
        ├── controllers/       # Route request & response handlers
        ├── middleware/        # JWT auth, validation, error handler
        ├── models/            # Mongoose schemas (User, Project, Task, Comment)
        ├── routes/            # API endpoints (/api/auth, /api/projects, etc.)
        └── utils/             # Token utilities, error classes, formatters
```

---

## 7. Development Prerequisites

Before running the application, ensure the following software is installed on your workstation:

| Prerequisite | Minimum Version | Status in Environment |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` (LTS recommended) | **Installed (`v24.13.0`)** |
| **npm** | `>= 9.0.0` | **Installed (`11.6.2`)** |
| **Git** | `>= 2.30.0` | **Installed (`2.48.1.windows.1`)** |
| **MongoDB** | `>= 6.0.0` (Local or MongoDB Atlas) | **Installed (`v8.3.4` / `mongosh 2.3.8`)** |

> **Note for Windows Users**: If running `npm` directly in PowerShell displays an execution policy restriction (`npm.ps1 cannot be loaded`), use `npm.cmd` or update execution policies using `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

---

## 8. Multi-Phase Development Roadmap

We are implementing TaskFlow iteratively across distinct, verifiable phases:

- [x] **Phase 0: Project Planning, Architecture & Workspace Setup** *(Completed)*
  - Inspect environment and verify prerequisites.
  - Define system architecture, database ER model, and security plan.
  - Scaffold clean client/server directory structure.
  - Setup `.gitignore`, `.env.example`, and baseline configurations.

- [x] **Phase 1: Backend Setup & Authentication** *(Completed)*
  - Initialize Express server with CORS, JSON body parser, and centralized error handling.
  - Connect to MongoDB using Mongoose with startup environment validation.
  - Create Mongoose User schema with bcrypt password hashing and safe JSON serialization.
  - Implement Auth APIs: Register (`POST /api/auth/register`), Login (`POST /api/auth/login`), and Current User (`GET /api/auth/me`).
  - Implement reusable JWT `authMiddleware` protecting private endpoints.
  - Create automated integration test suite (`tests/test-auth.js`) and Thunder Client / Postman collections.

- [x] **Phase 2: Project Management & Team Collaboration APIs** *(Completed)*
  - Create Mongoose Project schema with owner, members array, status enum, and deduplication hooks.
  - Implement CRUD APIs for projects (`POST /api/projects`, `GET /api/projects`, `GET /api/projects/:projectId`, `PATCH /api/projects/:projectId`, `DELETE /api/projects/:projectId`).
  - Implement team member management (`POST /api/projects/:projectId/members`, `DELETE /api/projects/:projectId/members/:userId`).
  - Support search by name, status filtering, and pagination with metadata.
  - Enforce ownership and membership authorization across all endpoints.
  - Create automated test suite (`tests/test-projects.js`, 39 assertions) and Thunder Client / Postman collections.

- [x] **Phase 3: Task Management & Assignment APIs** *(Completed)*
  - Create Mongoose Task schema with title, description, parent project reference, creator, assignees array, status enum, priority enum, dueDate, and deduplication hooks.
  - Implement Task creation (`POST /api/projects/:projectId/tasks`) and project task listing (`GET /api/projects/:projectId/tasks`) with search, status/priority/assignee/date filters, pagination, and deterministic sorting.
  - Implement Task details retrieval (`GET /api/tasks/:taskId`), update (`PATCH /api/tasks/:taskId`), and deletion (`DELETE /api/tasks/:taskId`).
  - Implement atomic assignee replacement (`PUT /api/tasks/:taskId/assignees`) enforcing parent project membership for all assignees.
  - Created automated test suite (`tests/test-tasks.js`, 46 assertions) and Thunder Client / Postman collections.

- [ ] **Phase 4: Task Comments & Collaboration APIs**
  - Mongoose Comment model referencing tasks and authors.
  - Threaded task comments CRUD endpoints (`/api/tasks/:taskId/comments`).
  - Author and project membership authorization for commenting.

- [ ] **Phase 5: Frontend Scaffolding & Design System**
  - Initialize React with Vite and configure Tailwind CSS.
  - Establish color palette, typography tokens, and layout components (Navbar, Sidebar, Container).
  - Set up React Router and global AuthContext for token and session state.

- [ ] **Phase 6: Authentication & Project Dashboard UI**
  - Build responsive Login and Register pages with form validation and user feedback.
  - Build Projects Dashboard: Project cards, Create Project modal, member invitation modal.

- [ ] **Phase 7: Interactive Kanban Board & Task Details**
  - Build Kanban board columns dynamically rendering tasks by status.
  - Task card component showing priority badges, assignees, and due dates.
  - Drag-and-drop or status toggle functionality to move tasks across columns.
  - Task Detail modal with full description editing and interactive comments feed.

- [ ] **Phase 8: Real-Time Synchronization with WebSockets**
  - Integrate Socket.IO on backend and frontend.
  - Synchronize task moves, card creations, and new comments across active board viewers in real time.

- [ ] **Phase 9: Testing, Optimization & Deployment Preparation**
  - Comprehensive API testing (Thunder Client / Postman collection).
  - Frontend production build verification (`npm run build`).
  - Security hardening, rate limiting, and production deployment guide.

---

## 9. Phase 0 Verification

To verify that the Phase 0 setup is properly structured:
1. Verify Git status:
   ```bash
   git status
   ```
2. Verify files and directory tree:
   - Root `.gitignore`, `.env.example`, `package.json`, `README.md`
   - `server/` directory with `package.json`, `.env.example`, and `src/` modules
   - `client/` directory with `public/` and `src/` modular components
3. Confirm `.env` is ignored by Git and sensitive secrets are not tracked.
