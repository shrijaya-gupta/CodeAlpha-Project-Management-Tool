/**
 * Automated Test Suite for Phase 2: Project Management & Team Collaboration
 * Tests all 14 required scenarios against separate test database: taskflow_test
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/taskflow_test';
process.env.JWT_SECRET = 'test_suite_jwt_secret_key_32chars_long!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PORT = '0';

const app = require('../src/app');
const User = require('../src/models/User');
const Project = require('../src/models/Project');

let server;
let baseUrl;

const runTests = async () => {
  console.log('====================================================');
  console.log('🧪 Starting TaskFlow Phase 2 Automated Test Suite');
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
    await Project.deleteMany({});
    await User.deleteMany({ email: { $regex: /@taskflow-phase2\.com$/ } });

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

    // Create 3 test users:
    // Alice (Owner)
    // Bob (Team Member)
    // Charlie (Unrelated User)
    const alice = await registerUser('Alice Walker', `alice.${Date.now()}@taskflow-phase2.com`, 'Password123!');
    const bob = await registerUser('Bob Builder', `bob.${Date.now()}@taskflow-phase2.com`, 'Password123!');
    const charlie = await registerUser('Charlie Brown', `charlie.${Date.now()}@taskflow-phase2.com`, 'Password123!');

    let testProjectId = '';

    // ====================================================
    // Scenario 1: Unauthenticated requests are rejected
    // ====================================================
    console.log('--- Test 1: Unauthenticated Requests Rejected ---');
    const unauthRes = await fetch(`${baseUrl}/api/projects`);
    assert(unauthRes.status === 401, 'GET /api/projects without token returns HTTP 401');

    const unauthPostRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauth Project' }),
    });
    assert(unauthPostRes.status === 401, 'POST /api/projects without token returns HTTP 401');

    // ====================================================
    // Scenario 2: Authenticated user can create a project
    // ====================================================
    console.log('\n--- Test 2: Authenticated User Can Create Project ---');
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        name: 'Alpha Redesign Project',
        description: 'Revamping the core system UI and backend architecture',
      }),
    });
    const createData = await createRes.json();
    assert(createRes.status === 201, 'POST /api/projects returns HTTP 201');
    assert(createData.success === true, 'Response indicates success = true');
    assert(createData.project.name === 'Alpha Redesign Project', 'Project name matches payload');
    assert(createData.project.status === 'active', 'Project status defaults to active');
    testProjectId = createData.project._id || createData.project.id;

    // ====================================================
    // Scenario 3: Creator becomes owner and member
    // ====================================================
    console.log('\n--- Test 3: Creator Automatically Becomes Owner and Member ---');
    assert(createData.project.owner._id === alice.user.id, 'Creator is set as project owner');
    const isAliceInMembers = createData.project.members.some(
      (m) => (m._id || m.id || m) === alice.user.id
    );
    assert(isAliceInMembers, 'Creator is included in members array');

    // ====================================================
    // Scenario 4: User can list only projects they can access
    // ====================================================
    console.log('\n--- Test 4: Project Listing Access Isolation ---');
    // Bob creates his own project
    const bobProjectRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bob.token}`,
      },
      body: JSON.stringify({
        name: 'Bob Secret Workshop',
        description: 'Private research project',
      }),
    });
    const bobProjectData = await bobProjectRes.json();
    const bobProjectId = bobProjectData.project._id;

    // Alice lists projects - should see Alice's project, but NOT Bob's project
    const aliceListRes = await fetch(`${baseUrl}/api/projects`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const aliceListData = await aliceListRes.json();
    const aliceSeesBobProject = aliceListData.projects.some((p) => p._id === bobProjectId);
    assert(!aliceSeesBobProject, 'Alice cannot see Bob private project');
    assert(aliceListData.projects.some((p) => p._id === testProjectId), 'Alice sees her own project');

    // Charlie lists projects - should see 0 projects
    const charlieListRes = await fetch(`${baseUrl}/api/projects`, {
      headers: { Authorization: `Bearer ${charlie.token}` },
    });
    const charlieListData = await charlieListRes.json();
    assert(charlieListData.projects.length === 0, 'Unrelated user Charlie sees 0 projects');

    // ====================================================
    // Scenario 5: Search, status filtering, and pagination work
    // ====================================================
    console.log('\n--- Test 5: Search, Filtering & Pagination ---');
    // Create additional project for search/filter testing
    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        name: 'Alpha Mobile Companion',
        description: 'Mobile app companion',
      }),
    });

    // Test search filter
    const searchRes = await fetch(`${baseUrl}/api/projects?search=Companion`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const searchData = await searchRes.json();
    assert(searchData.projects.length === 1, 'Search query returns exactly 1 matching project');
    assert(searchData.projects[0].name.includes('Companion'), 'Search match contains search term');

    // Test pagination
    const pageRes = await fetch(`${baseUrl}/api/projects?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const pageData = await pageRes.json();
    assert(pageData.projects.length === 1, 'Pagination limit=1 returns 1 project');
    assert(pageData.pagination.limit === 1, 'Pagination metadata reflects limit=1');
    assert(pageData.pagination.totalPages >= 2, 'Total pages calculated correctly');

    // Test status filter
    const statusRes = await fetch(`${baseUrl}/api/projects?status=active`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const statusData = await statusRes.json();
    assert(statusData.projects.every((p) => p.status === 'active'), 'Status filter returns only active projects');

    // ====================================================
    // Scenario 6: Owner can view and update their project
    // ====================================================
    console.log('\n--- Test 6: Owner View & Update Project ---');
    const viewRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const viewData = await viewRes.json();
    assert(viewRes.status === 200, 'Owner can view project details (HTTP 200)');
    assert(viewData.project.name === 'Alpha Redesign Project', 'Viewed project name matches');

    // Update project
    const updateRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        name: 'Alpha Modernized Suite',
        status: 'completed',
      }),
    });
    const updateData = await updateRes.json();
    assert(updateRes.status === 200, 'Owner can update project (HTTP 200)');
    assert(updateData.project.name === 'Alpha Modernized Suite', 'Updated name is persisted');
    assert(updateData.project.status === 'completed', 'Updated status is persisted');

    // ====================================================
    // Scenario 7: Non-member cannot access private project details
    // ====================================================
    console.log('\n--- Test 7: Non-Member Access Denied ---');
    const forbiddenRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
      headers: { Authorization: `Bearer ${charlie.token}` },
    });
    assert(forbiddenRes.status === 403, 'Non-member Charlie receives HTTP 403 on project details');

    // ====================================================
    // Scenario 8: Non-owner cannot update or delete a project
    // ====================================================
    console.log('\n--- Test 8: Non-Owner Cannot Update or Delete Project ---');
    const forbiddenUpdateRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${charlie.token}`,
      },
      body: JSON.stringify({ name: 'Hacked by Charlie' }),
    });
    assert(forbiddenUpdateRes.status === 403, 'Non-owner update receives HTTP 403 Forbidden');

    const forbiddenDeleteRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${charlie.token}` },
    });
    assert(forbiddenDeleteRes.status === 403, 'Non-owner delete receives HTTP 403 Forbidden');

    // ====================================================
    // Scenario 9: Only the owner can add or remove members
    // ====================================================
    console.log('\n--- Test 9: Member Management (Owner Only) ---');
    // Alice (Owner) adds Bob as member
    const addMemberRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ email: bob.user.email }),
    });
    const addMemberData = await addMemberRes.json();
    assert(addMemberRes.status === 200, 'Owner can add member (HTTP 200)');
    const isBobNowMember = addMemberData.members.some((m) => m.email === bob.user.email);
    assert(isBobNowMember, 'Bob is now present in project members list');

    // Bob (now a member, but not owner) tries to add Charlie
    const nonOwnerAddRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bob.token}`,
      },
      body: JSON.stringify({ email: charlie.user.email }),
    });
    assert(nonOwnerAddRes.status === 403, 'Non-owner member Bob cannot add another member (HTTP 403)');

    // ====================================================
    // Scenario 10: Duplicate member additions are rejected
    // ====================================================
    console.log('\n--- Test 10: Duplicate Member Rejection ---');
    // Try adding Bob again
    const dupAddRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ email: bob.user.email }),
    });
    assert(dupAddRes.status === 400, 'Adding already-existing member returns HTTP 400');

    // Try adding the owner again
    const ownerAddRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ email: alice.user.email }),
    });
    assert(ownerAddRes.status === 400, 'Adding project owner as member returns HTTP 400');

    // ====================================================
    // Scenario 11: The owner cannot be removed as a member
    // ====================================================
    console.log('\n--- Test 11: Owner Cannot Be Removed ---');
    const removeOwnerRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/members/${alice.user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(removeOwnerRes.status === 400, 'Removing project owner returns HTTP 400 Bad Request');

    // Removing valid member Bob works
    const removeBobRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/members/${bob.user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(removeBobRes.status === 200, 'Owner can remove member Bob (HTTP 200)');

    // ====================================================
    // Scenario 12: Invalid MongoDB IDs return appropriate errors
    // ====================================================
    console.log('\n--- Test 12: Invalid MongoDB ObjectId Rejection ---');
    const invalidIdRes = await fetch(`${baseUrl}/api/projects/not-a-valid-object-id`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(invalidIdRes.status === 400, 'Invalid project ID format returns HTTP 400');

    const invalidMemberIdRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/members/invalid-user-id`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(invalidMemberIdRes.status === 400, 'Invalid member ID format returns HTTP 400');

    // ====================================================
    // Scenario 13: Project cannot be deleted by an unrelated user
    // ====================================================
    console.log('\n--- Test 13: Project Deletion Authorization ---');
    const charlieDeleteRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${charlie.token}` },
    });
    assert(charlieDeleteRes.status === 403, 'Unrelated user cannot delete project (HTTP 403)');

    // Owner deletes project
    const aliceDeleteRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(aliceDeleteRes.status === 200, 'Owner can delete project (HTTP 200)');

    // Deleted project is no longer found
    const getDeletedRes = await fetch(`${baseUrl}/api/projects/${testProjectId}`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    assert(getDeletedRes.status === 404, 'Querying deleted project returns HTTP 404 Not Found');

    // ====================================================
    // Scenario 14: Existing authentication endpoints continue to work
    // ====================================================
    console.log('\n--- Test 14: Existing Auth Endpoints Unbroken ---');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    const meData = await meRes.json();
    assert(meRes.status === 200, 'GET /api/auth/me continues to work (HTTP 200)');
    assert(meData.user.email === alice.user.email, 'GET /api/auth/me returns valid user info');

    // Cleanup test collections
    await Project.deleteMany({});
    await User.deleteMany({ email: { $regex: /@taskflow-phase2\.com$/ } });

    console.log('\n====================================================');
    console.log(`📊 Phase 2 Test Summary: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during Phase 2 test execution:', err);
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
