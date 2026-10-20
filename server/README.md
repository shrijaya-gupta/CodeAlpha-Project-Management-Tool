# TaskFlow Backend — Phases 1, 2 & 3: Auth, Projects & Task Management

This directory contains the RESTful backend API for **TaskFlow**, implemented with Node.js, Express, MongoDB (Mongoose), and JSON Web Tokens (JWT) using CommonJS.

---

## 1. Prerequisites

Before running the server, ensure you have the following installed on your system:

| Prerequisite | Minimum Version | Verified Local Status |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` (LTS recommended) | Installed (`v24.13.0`) |
| **npm** | `>= 9.0.0` | Installed (`11.6.2`) |
| **MongoDB** | `>= 6.0.0` | Installed (`v8.3.4`) |

---

## 2. Installation & Dependencies

To install backend dependencies:

```bash
cd server
npm install
```

### Installed Packages:
- `express`: Core REST API web server framework.
- `mongoose`: Object Document Mapper (ODM) for MongoDB data modeling and validation.
- `bcryptjs`: Secure cryptographic password hashing with salts.
- `jsonwebtoken`: Signing, issuing, and verifying stateless Bearer JWTs.
- `cors`: Cross-Origin Resource Sharing configuration for frontend access.
- `dotenv`: Loads configuration from `.env` files into `process.env`.
- `express-validator`: Declarative request payload validation and sanitization.

---

## 3. Environment Variable Setup

The server requires specific environment variables to start. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### Environment Variables Reference (`server/.env`):
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/taskflow
JWT_SECRET=super_secret_taskflow_dev_key_2026_antigravity_jwt_secret
JWT_EXPIRES_IN=1d
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

> **Security Notice**: Never commit `.env` to Git. The `.gitignore` file already excludes `.env` and `*.env`. Ensure `JWT_SECRET` is at least 32 characters long in production.

---

## 4. How to Start the Server

### Development Mode (with automatic file reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

### Automated Integration Test Suites:
```bash
# Run all automated test suites across all phases (117 assertions)
npm test

# Run Phase 1 Authentication tests only (32 assertions)
npm run test:auth

# Run Phase 2 Project Management tests only (39 assertions)
npm run test:projects

# Run Phase 3 Task Management tests only (46 assertions)
npm run test:tasks
```
*(Tests run against a separate test database: `mongodb://127.0.0.1:27017/taskflow_test`).*

---

## 5. Database Models & Relationships

### 1. User Model (`server/src/models/User.js`)
- `_id`: ObjectId (Primary key)
- `name`: String, required, trimmed, 2-50 chars
- `email`: String, required, unique, lowercase, trimmed, valid email format
- `password`: String, required, bcrypt hash, `select: false` (excluded from responses)
- `createdAt` & `updatedAt`: Timestamps

### 2. Project Model (`server/src/models/Project.js`)
- `_id`: ObjectId (Primary key)
- `name`: String, required, trimmed, 2-100 chars
- `description`: String, optional, max 500 chars, default `""`
- `owner`: ObjectId, reference to `User` (creator automatically assigned)
- `members`: Array of ObjectIds, references to `User` (creator included, deduplicated)
- `status`: String enum (`"active"`, `"completed"`, `"archived"`), default `"active"`
- `createdAt` & `updatedAt`: Timestamps

### 3. Task Model (`server/src/models/Task.js`)
- `_id`: ObjectId (Primary key)
- `title`: String, required, trimmed, 1-150 chars
- `description`: String, optional, max 5000 chars, default `""`
- `project`: ObjectId, reference to `Project` (required, indexed)
- `createdBy`: ObjectId, reference to `User` (required, indexed)
- `assignees`: Array of ObjectIds referencing `User` (indexed, must belong to parent project)
- `status`: String enum (`"todo"`, `"in_progress"`, `"done"`), default `"todo"` (indexed)
- `priority`: String enum (`"low"`, `"medium"`, `"high"`, `"urgent"`), default `"medium"` (indexed)
- `dueDate`: Date, optional, default `null` (indexed)
- `createdAt` & `updatedAt`: Timestamps

#### Entity Relationships:
- **User 1 : N Project (Owner)**: A user owns multiple projects.
- **User N : M Project (Members)**: A project contains multiple team members.
- **Project 1 : N Task**: A project contains multiple tasks.
- **User 1 : N Task (Creator)**: A user creates multiple tasks.
- **User N : M Task (Assignees)**: Multiple users can be assigned to a task; users must be project members.

---

## 6. API Endpoints Documentation

### Base URL: `http://localhost:5000`

---

### A. Authentication & Health Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Confirms server is running and database is connected. |
| `POST` | `/api/auth/register` | Public | Registers a new user account with hashed password and generates initial JWT. |
| `POST` | `/api/auth/login` | Public | Authenticates user and returns a signed JWT token. |
| `GET` | `/api/auth/me` | Private | Retrieves the authenticated user's profile (`Bearer <token>`). |

---

### B. Project Management Endpoints (Requires `Authorization: Bearer <token>`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/projects` | Authenticated | Creates a new project with creator as owner and initial member. |
| `GET` | `/api/projects` | Owner / Member | Lists accessible projects (`?search=`, `?status=`, `?page=`, `?limit=`). |
| `GET` | `/api/projects/:projectId` | Owner / Member | Returns project details with populated owner and members. |
| `PATCH` | `/api/projects/:projectId` | **Owner Only** | Updates project `name`, `description`, or `status`. |
| `POST` | `/api/projects/:projectId/members` | **Owner Only** | Adds a team member by registered email. |
| `DELETE` | `/api/projects/:projectId/members/:userId` | **Owner Only** | Removes a team member (owner cannot be removed). |
| `DELETE` | `/api/projects/:projectId` | **Owner Only** | Permanently deletes project. |

---

### C. Task Management Endpoints (Requires `Authorization: Bearer <token>`)

All task endpoints require membership in the parent project.

#### 1. Create a Task in Project
- **Method**: `POST`
- **URL**: `/api/projects/:projectId/tasks`
- **Access**: Project Members only
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <your_jwt_token>`
- **Request Body**:
```json
{
  "title": "Design Database Schema",
  "description": "Prepare ER diagram, Mongoose schemas, and indexes",
  "priority": "high",
  "status": "todo",
  "dueDate": "2026-12-15T18:00:00.000Z",
  "assignees": ["67153b8f52f36f9872e452a1"]
}
```
- **Validation**:
  - `title`: Required, 1 to 150 characters.
  - `priority`: Optional enum (`low`, `medium`, `high`, `urgent`).
  - `status`: Optional enum (`todo`, `in_progress`, `done`).
  - `dueDate`: Optional valid ISO date.
  - `assignees`: Optional array of user IDs. Every assignee **must be an existing member of the parent project**.
- **Success Response (`201 Created`)**:
```json
{
  "success": true,
  "message": "Task created successfully",
  "task": {
    "_id": "67154a1b72e452a1b9e84123",
    "title": "Design Database Schema",
    "description": "Prepare ER diagram, Mongoose schemas, and indexes",
    "project": "67153f9a72e452a1b9e8401a",
    "createdBy": {
      "_id": "67153b8f52f36f9872e452a1",
      "name": "Alex Johnson",
      "email": "alex.johnson@example.com"
    },
    "assignees": [
      {
        "_id": "67153b8f52f36f9872e452a1",
        "name": "Alex Johnson",
        "email": "alex.johnson@example.com"
      }
    ],
    "status": "todo",
    "priority": "high",
    "dueDate": "2026-12-15T18:00:00.000Z",
    "createdAt": "2026-10-20T17:30:00.000Z",
    "updatedAt": "2026-10-20T17:30:00.000Z"
  }
}
```

---

#### 2. List Tasks in a Project
- **Method**: `GET`
- **URL**: `/api/projects/:projectId/tasks`
- **Access**: Project Members only
- **Query Parameters**:
  - `status`: Filter by status (`todo`, `in_progress`, `done`)
  - `priority`: Filter by priority (`low`, `medium`, `high`, `urgent`)
  - `assignee`: Filter by assigned user ID
  - `search`: Case-insensitive substring search on task `title` and `description`
  - `dueBefore`: Tasks due on or before specified ISO date (`dueDate <= dueBefore`)
  - `dueAfter`: Tasks due on or after specified ISO date (`dueDate >= dueAfter`)
  - `page`: Page number (Default: `1`)
  - `limit`: Items per page (Default: `10`, Max: `50`)
  - `sortBy`: Field to sort by (`createdAt`, `dueDate`, `priority`, `status`, `title`, Default: `createdAt`)
  - `order`: Sort order (`asc` or `desc`, Default: `desc`)
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "count": 1,
  "total": 1,
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  },
  "tasks": [...]
}
```

---

#### 3. Get Task Details
- **Method**: `GET`
- **URL**: `/api/tasks/:taskId`
- **Access**: Project Members only
- **Success Response (`200 OK`)**: Returns task details with populated project, createdBy, and assignees.

---

#### 4. Update a Task
- **Method**: `PATCH`
- **URL**: `/api/tasks/:taskId`
- **Access**: Project Members only
- **Permitted Fields**: `title`, `description`, `priority`, `status`, `dueDate`
- **Request Body**:
```json
{
  "title": "Design Scalable Database Schema",
  "status": "in_progress",
  "priority": "urgent"
}
```
- **Success Response (`200 OK`)**: Returns updated task.

---

#### 5. Assign or Update Assignees
- **Method**: `PUT`
- **URL**: `/api/tasks/:taskId/assignees`
- **Access**: Project Members only
- **Request Body**:
```json
{
  "assignees": ["67153b8f52f36f9872e452a1", "67153c9052f36f9872e452b2"]
}
```
- **Rules**:
  - Replaces entire assignee list with the provided array.
  - Sending `[]` unassigns all members.
  - Every assignee **must be a member of the parent project**.
  - Duplicate IDs are rejected.
  - If any assignee is invalid, the operation fails atomically without partial modification.
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Task assignees updated successfully",
  "assignees": [...],
  "task": {...}
}
```

---

#### 6. Delete a Task
- **Method**: `DELETE`
- **URL**: `/api/tasks/:taskId`
- **Access**: Project Members only
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

---

## 7. How to Test with Thunder Client & Postman

### Thunder Client:
1. Open Thunder Client in VS Code / IDE.
2. Go to **Collections** -> Click `...` -> **Import**.
3. Import all three collections:
   - `server/thunder-collection_taskflow_auth.json` (Authentication)
   - `server/thunder-collection_taskflow_projects.json` (Project Management)
   - `server/thunder-collection_taskflow_tasks.json` (Task Management)
4. Set the `{{auth_token}}`, `{{project_id}}`, and `{{task_id}}` variables in Thunder Client environment.

### Postman:
1. Open Postman -> Click **Import**.
2. Select `server/taskflow_postman_collection.json`, `server/taskflow_projects_postman_collection.json`, and `server/taskflow_tasks_postman_collection.json`.

---

## 8. Common MongoDB Troubleshooting Steps

If the server reports connection errors (`connect ECONNREFUSED 127.0.0.1:27017`):

1. **Verify if MongoDB Service is Running**:
   - On Windows (PowerShell):
     ```powershell
     Get-Service -Name MongoDB
     ```
   - If Stopped, start it:
     ```powershell
     Start-Service -Name MongoDB
     ```
2. **Verify with MongoDB Shell (`mongosh`)**:
   ```bash
   mongosh --eval "db.adminCommand('ping')"
   ```
   *Expected output*: `{ ok: 1 }`.
3. **Using MongoDB Atlas (Cloud)**:
   - In `.env`, update `MONGO_URI`:
     ```env
     MONGO_URI=mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/taskflow?retryWrites=true&w=majority
     ```
   - Whitelist your current IP address in Atlas Network Access.
