/**
 * Automated Test Suite for Phase 3: Task Management & Assignment
 * Tests all 15 required scenarios against separate test database: taskflow_test
 */

const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/taskflow_test';
process.env.JWT_SECRET = 'test_suite_jwt_secret_key_32chars_long!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PORT = '0';

const app = require('../src/app');
const User = require('../src/models/User');
const Project = require('../src/models/Project');
const Task = require('../src/models/Task');

let server;
let baseUrl;

const runTests = async () => {
  console.log('====================================================');
  console.log('🧪 Starting TaskFlow Phase 3 Automated Test Suite');
  console.log('   Test Database: mongodb://127.0.0.1:27017/taskflow_test');
  console.log('====================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  const assert = (condition, description) => {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failedCount++;
    }
  };

  try {
    // 1. Connect to test database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[Test Setup] Connected to test database successfully.\n');

    // Clean up test data
    await Task.deleteMany({});
    await Project.deleteMany({});
    await User.deleteMany({ email: { $regex: /@taskflow-phase3\.com$/ } });

    // 2. Start dynamic test HTTP server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Test Setup] Test server listening on ${baseUrl}\n`);
        resolve();
      });
    });

    // Helper: Register user and obtain token
    const registerUser = async (name, email, password) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      return { token: data.token, user: data.user };
    };

    // Helper: Create project
    const createProject = async (token, name, description) => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      return data.project;
    };

    // Helper: Add member to project
    const addMember = async (ownerToken, projectId, memberEmail) => {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ email: memberEmail }),
      });
      return res.json();
    };

    // Create 3 users: Alice (Owner), Bob (Member), Charlie (Non-member)
    const alice = await registerUser('Alice TaskMaster', `alice.${Date.now()}@taskflow-phase3.com`, 'Password123!');
    const bob = await registerUser('Bob Developer', `bob.${Date.now()}@taskflow-phase3.com`, 'Password123!');
    const charlie = await registerUser('Charlie Outsider', `charlie.${Date.now()}@taskflow-phase3.com`, 'Password123!');

    // Alice creates Project Alpha and adds Bob as member
    const projectAlpha = await createProject(alice.token, 'Project Alpha', 'Main collaboration project');
    await addMember(alice.token, projectAlpha._id, bob.user.email);

    // Charlie creates Project Charlie (isolated)
    const projectCharlie = await createProject(charlie.token, 'Project Charlie', 'Private to Charlie');

    let createdTaskId = '';

    // ====================================================
    // Scenario 1: Unauthenticated users cannot access task APIs
    // ====================================================
    console.log('--- Test 1: Unauthenticated Access Rejection ---');
    const unauthPost = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task without auth' }),
    });
    assert(unauthPost.status === 401, 'POST /api/projects/:id/tasks without token returns 401');

    const unauthGet = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`);
    assert(unauthGet.status === 401, 'GET /api/projects/:id/tasks without token returns 401');

    const unauthTaskGet = await fetch(`${baseUrl}/api/tasks/67153b8f52f36f9872e452a1`);
    assert(unauthTaskGet.status === 401, 'GET /api/tasks/:id without token returns 401');

    // ====================================================
    // Scenario 2: Project members can create and list tasks
    // ====================================================
    console.log('\n--- Test 2: Project Members Can Create and List Tasks ---');
    // Alice creates Task 1
    const aliceTaskRes = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        title: 'Design Database Schema',
        description: 'Define relational models and indexes',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-12-01T12:00:00.000Z',
      }),
    });
    const aliceTaskData = await aliceTaskRes.json();
    assert(aliceTaskRes.status === 201, 'Owner Alice can create task (HTTP 201)');
    assert(aliceTaskData.success === true, 'Task creation response indicates success');
    assert(aliceTaskData.task.title === 'Design Database Schema', 'Task title matches input');
    createdTaskId = aliceTaskData.task._id;

    // Bob (member) creates Task 2
    const bobTaskRes = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bob.token}`,
      },
      body: JSON.stringify({
        title: 'Implement REST Endpoints',
        description: 'Code the Express controller routes',
        priority: 'medium',
        status: 'in_progress',
      }),
    });
    const bobTaskData = await bobTaskRes.json();
    assert(bobTaskRes.status === 201, 'Member Bob can create task (HTTP 201)');
    const bobTaskId = bobTaskData.task._id;

    // Both can list tasks
    const listRes = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    const listData = await listRes.json();
    assert(listRes.status === 200, 'Member Bob can list project tasks (HTTP 200)');
    assert(listData.tasks.length === 2, 'Task list contains both created tasks');

    // ====================================================
    // Scenario 3: Non-members cannot read or create tasks in private projects
    // ====================================================
    console.log('\n--- Test 3: Non-Members Access Denied ---');
    const outsiderCreate = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${charlie.token}`,
      },
      body: JSON.stringify({ title: 'Intruder Task' }),
    });
    assert(outsiderCreate.status === 403, 'Non-member Charlie cannot create task in Alpha (HTTP 403)');

    const outsiderList = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      headers: { Authorization: `Bearer ${charlie.token}` },
    });
    assert(outsiderList.status === 403, 'Non-member Charlie cannot list tasks in Alpha (HTTP 403)');

    // ====================================================
    // Scenario 4: Task creator is derived from authenticated user
    // ====================================================
    console.log('\n--- Test 4: Task Creator Derivation ---');
    assert(bobTaskData.task.createdBy._id === bob.user.id, 'Task creator is automatically set to Bob');

    // Attempting to spoof createdBy is safely ignored
    const spoofRes = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        title: 'Spoof Test Task',
        createdBy: charlie.user.id,
      }),
    });
    const spoofData = await spoofRes.json();
    assert(spoofData.task.createdBy._id === alice.user.id, 'Client-supplied createdBy was ignored in favor of authenticated user');

    // ====================================================
    // Scenario 5: Invalid task IDs and project IDs are rejected
    // ====================================================
    console.log('\n--- Test 5: Invalid ID Format Rejections ---');
    const badProjectId = await fetch(`${baseUrl}/api/projects/invalid-project-id/tasks`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(badProjectId.status === 400, 'Invalid project ID in task listing returns HTTP 400');

    const badTaskId = await fetch(`${baseUrl}/api/tasks/invalid-task-id`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(badTaskId.status === 400, 'Invalid task ID in getTaskById returns HTTP 400');

    // ====================================================
    // Scenario 6: Invalid statuses, priorities, dates, and empty titles are rejected
    // ====================================================
    console.log('\n--- Test 6: Validation Rejections ---');
    const emptyTitle = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ title: '   ' }),
    });
    assert(emptyTitle.status === 400, 'Empty title returns HTTP 400');

    const invalidStatus = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ title: 'Valid Title', status: 'unknown_status' }),
    });
    assert(invalidStatus.status === 400, 'Invalid status returns HTTP 400');

    const invalidPriority = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ title: 'Valid Title', priority: 'super_urgent' }),
    });
    assert(invalidPriority.status === 400, 'Invalid priority returns HTTP 400');

    const invalidDate = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ title: 'Valid Title', dueDate: 'not-a-real-date' }),
    });
    assert(invalidDate.status === 400, 'Invalid dueDate format returns HTTP 400');

    // ====================================================
    // Scenario 7: Task details accessible only to project members
    // ====================================================
    console.log('\n--- Test 7: Task Details Access Restriction ---');
    const memberGetTask = await fetch(`${baseUrl}/api/tasks/${createdTaskId}`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    const memberTaskData = await memberGetTask.json();
    assert(memberGetTask.status === 200, 'Member Bob can view task details (HTTP 200)');
    assert(memberTaskData.task.title === 'Design Database Schema', 'Task details contain correct title');

    const outsiderGetTask = await fetch(`${baseUrl}/api/tasks/${createdTaskId}`, {
      headers: { Authorization: `Bearer ${charlie.token}` },
    });
    assert(outsiderGetTask.status === 403, 'Non-member Charlie cannot view task details (HTTP 403)');

    // ====================================================
    // Scenario 8: Task updates reject unsupported fields
    // ====================================================
    console.log('\n--- Test 8: Task Update Security & Field Whitelist ---');
    const emptyUpdate = await fetch(`${baseUrl}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({}),
    });
    assert(emptyUpdate.status === 400, 'Empty PATCH body returns HTTP 400');

    const forbiddenFieldUpdate = await fetch(`${baseUrl}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ project: projectCharlie._id, hackerField: true }),
    });
    assert(forbiddenFieldUpdate.status === 400, 'Attempt to update forbidden fields returns HTTP 400');

    // Valid update
    const validUpdate = await fetch(`${baseUrl}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        title: 'Design Scalable Database Schema',
        priority: 'urgent',
        status: 'in_progress',
      }),
    });
    const validUpdateData = await validUpdate.json();
    assert(validUpdate.status === 200, 'Valid update returns HTTP 200');
    assert(validUpdateData.task.title === 'Design Scalable Database Schema', 'Updated title is saved');
    assert(validUpdateData.task.priority === 'urgent', 'Updated priority is saved');

    // ====================================================
    // Scenario 9: Assignees must belong to the same project
    // ====================================================
    console.log('\n--- Test 9: Assignee Project Membership Enforcement ---');
    const outsiderAssign = await fetch(`${baseUrl}/api/tasks/${createdTaskId}/assignees`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ assignees: [charlie.user.id] }),
    });
    assert(outsiderAssign.status === 400, 'Assigning non-member Charlie returns HTTP 400');

    // ====================================================
    // Scenario 10: Duplicate assignees are rejected
    // ====================================================
    console.log('\n--- Test 10: Duplicate Assignees Rejection ---');
    const duplicateAssign = await fetch(`${baseUrl}/api/tasks/${createdTaskId}/assignees`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ assignees: [bob.user.id, bob.user.id] }),
    });
    assert(duplicateAssign.status === 400, 'Duplicate assignees in PUT payload returns HTTP 400');

    // ====================================================
    // Scenario 11: Invalid assignee does not cause a partial update
    // ====================================================
    console.log('\n--- Test 11: Atomic Failure on Invalid Assignee ---');
    // Assign Bob initially
    await fetch(`${baseUrl}/api/tasks/${createdTaskId}/assignees`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ assignees: [bob.user.id] }),
    });

    // Try assigning Alice + Charlie (Charlie is invalid)
    const partialFail = await fetch(`${baseUrl}/api/tasks/${createdTaskId}/assignees`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ assignees: [alice.user.id, charlie.user.id] }),
    });
    assert(partialFail.status === 400, 'Mixed valid/invalid assignees payload returns HTTP 400');

    // Verify task assignees in DB were NOT partially updated
    const taskAfterFail = await Task.findById(createdTaskId);
    assert(taskAfterFail.assignees.length === 1, 'Assignees count remains 1');
    assert(taskAfterFail.assignees[0].toString() === bob.user.id, 'Original assignee Bob remains intact');

    // ====================================================
    // Scenario 12: An empty assignee list unassigns everyone
    // ====================================================
    console.log('\n--- Test 12: Empty Assignee List Unassigns Everyone ---');
    const unassignRes = await fetch(`${baseUrl}/api/tasks/${createdTaskId}/assignees`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ assignees: [] }),
    });
    const unassignData = await unassignRes.json();
    assert(unassignRes.status === 200, 'Empty assignees array returns HTTP 200');
    assert(unassignData.task.assignees.length === 0, 'Task assignees array is now empty');

    // ====================================================
    // Scenario 13: Search, filters, sorting, and pagination work together
    // ====================================================
    console.log('\n--- Test 13: Search, Filters, Sorting & Pagination ---');
    // Create additional tasks
    await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        title: 'Alpha UI Wireframes',
        description: 'Figma mockups for board views',
        status: 'done',
        priority: 'low',
        dueDate: '2026-11-01T00:00:00.000Z',
      }),
    });

    // Filter by status=done
    const filterStatus = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks?status=done`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const filterStatusData = await filterStatus.json();
    assert(filterStatusData.tasks.every((t) => t.status === 'done'), 'Status filter returns only done tasks');

    // Search by title "Wireframes"
    const searchTasks = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks?search=Wireframes`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const searchData = await searchTasks.json();
    assert(searchData.tasks.length === 1, 'Search query returns 1 matching task');
    assert(searchData.tasks[0].title.includes('Wireframes'), 'Search result contains keyword');

    // Pagination limit=1
    const pageTasks = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const pageData = await pageTasks.json();
    assert(pageData.tasks.length === 1, 'Pagination limit=1 returns 1 task');
    assert(pageData.pagination.totalPages >= 2, 'Total pages calculated accurately');

    // Deterministic sorting by title asc
    const sortTasks = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}/tasks?sortBy=title&order=asc`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const sortData = await sortTasks.json();
    assert(sortTasks.status === 200, 'Sorting returns HTTP 200');
    assert(sortData.tasks[0].title.localeCompare(sortData.tasks[1].title) <= 0, 'Tasks are sorted in ascending title order');

    // ====================================================
    // Scenario 14: Only authorized project members can delete tasks
    // ====================================================
    console.log('\n--- Test 14: Task Deletion Authorization ---');
    const outsiderDelete = await fetch(`${baseUrl}/api/tasks/${bobTaskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${charlie.token}` },
    });
    assert(outsiderDelete.status === 403, 'Non-member Charlie cannot delete task (HTTP 403)');

    // Project member Bob deletes his task
    const memberDelete = await fetch(`${baseUrl}/api/tasks/${bobTaskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    assert(memberDelete.status === 200, 'Member Bob can delete task (HTTP 200)');

    // Verify task is deleted
    const verifyDeleted = await fetch(`${baseUrl}/api/tasks/${bobTaskId}`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    assert(verifyDeleted.status === 404, 'Querying deleted task returns HTTP 404 Not Found');

    // ====================================================
    // Scenario 15: Existing authentication and project APIs still work
    // ====================================================
    console.log('\n--- Test 15: Backward Compatibility (Auth & Projects) ---');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(meRes.status === 200, 'GET /api/auth/me still functions properly (HTTP 200)');

    const projectRes = await fetch(`${baseUrl}/api/projects/${projectAlpha._id}`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(projectRes.status === 200, 'GET /api/projects/:id still functions properly (HTTP 200)');

    // Cleanup
    await Task.deleteMany({});
    await Project.deleteMany({});
    await User.deleteMany({ email: { $regex: /@taskflow-phase3\.com$/ } });

    console.log('\n====================================================');
    console.log(`📊 Phase 3 Test Summary: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during Phase 3 test execution:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
    console.log('[Test Teardown] Test database disconnected and server closed.');
  }
};

runTests();
