/**
 * Automated Test Suite for Phase 1: TaskFlow Authentication & Server Setup
 * Tests all 10 required scenarios using a separate test database: taskflow_test
 */

const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Configure test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/taskflow_test';
process.env.JWT_SECRET = 'test_suite_jwt_secret_key_32chars_long!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PORT = '0'; // Dynamic port for testing

const app = require('../src/app');
const User = require('../src/models/User');

let server;
let baseUrl;

const runTests = async () => {
  console.log('====================================================');
  console.log('🧪 Starting TaskFlow Phase 1 Automated Test Suite');
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

    // Clean up test users collection before running tests
    await User.deleteMany({ email: { $regex: /@taskflow-test\.com$/ } });

    // 2. Start HTTP server on dynamic port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Test Setup] Test server listening on ${baseUrl}\n`);
        resolve();
      });
    });

    const testUser = {
      name: 'Alex Johnson',
      email: `alex.${Date.now()}@taskflow-test.com`,
      password: 'StrongPassword123!',
    };

    let authToken = '';

    // ====================================================
    // Scenario 1: Health endpoint works
    // ====================================================
    console.log('--- Test 1: Health Check Endpoint ---');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200, 'GET /api/health returns HTTP 200');
    assert(healthData.status === 'ok', 'Health response payload contains status "ok"');

    // ====================================================
    // Scenario 2: Register succeeds with valid input
    // ====================================================
    console.log('\n--- Test 2: User Registration (Valid Input) ---');
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    const registerData = await registerRes.json();
    assert(registerRes.status === 201, 'POST /api/auth/register returns HTTP 201');
    assert(registerData.success === true, 'Response indicates success = true');
    assert(Boolean(registerData.token), 'Registration returns an authentication token');
    assert(registerData.user.name === testUser.name, 'Returned user name matches input');
    assert(registerData.user.email === testUser.email.toLowerCase(), 'Returned user email is normalized');
    assert(registerData.user.password === undefined, 'Password is NOT exposed in registration response');
    authToken = registerData.token;

    // ====================================================
    // Scenario 3: Registration rejects invalid email and missing fields
    // ====================================================
    console.log('\n--- Test 3: Registration Validation Rejection ---');
    const invalidEmailRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A', // Too short
        email: 'invalid-email-format',
        password: 'short', // Too short
      }),
    });
    const invalidEmailData = await invalidEmailRes.json();
    assert(invalidEmailRes.status === 400, 'Invalid registration payload returns HTTP 400');
    assert(invalidEmailData.success === false, 'Invalid registration payload has success = false');
    assert(Array.isArray(invalidEmailData.errors), 'Validation errors array is returned');

    // ====================================================
    // Scenario 4: Duplicate email is rejected
    // ====================================================
    console.log('\n--- Test 4: Duplicate Email Rejection ---');
    const duplicateRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    const duplicateData = await duplicateRes.json();
    assert(duplicateRes.status === 400, 'Duplicate email registration returns HTTP 400');
    assert(duplicateData.success === false, 'Duplicate email returns success = false');

    // ====================================================
    // Scenario 5: Database stores a hashed password rather than plaintext
    // ====================================================
    console.log('\n--- Test 5: Verify Password Hashing in Database ---');
    const dbUser = await User.findOne({ email: testUser.email.toLowerCase() }).select('+password');
    assert(Boolean(dbUser), 'User record exists in MongoDB');
    assert(dbUser.password !== testUser.password, 'Stored password is NOT stored as plaintext');
    assert(dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$'), 'Password is valid bcrypt hash ($2a$/$2b$)');

    // ====================================================
    // Scenario 6: Login succeeds with the correct password
    // ====================================================
    console.log('\n--- Test 6: User Login (Correct Password) ---');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, 'POST /api/auth/login returns HTTP 200');
    assert(loginData.success === true, 'Login returns success = true');
    assert(Boolean(loginData.token), 'Login returns a valid JWT token');
    assert(loginData.user.email === testUser.email.toLowerCase(), 'Login returns matching user info');
    assert(loginData.user.password === undefined, 'Password is NOT exposed in login response');

    // ====================================================
    // Scenario 7: Login fails with an incorrect password
    // ====================================================
    console.log('\n--- Test 7: User Login (Incorrect Password) ---');
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: 'WrongPassword999!',
      }),
    });
    const badLoginData = await badLoginRes.json();
    assert(badLoginRes.status === 401, 'Login with incorrect password returns HTTP 401');
    assert(badLoginData.success === false, 'Bad login returns success = false');

    // ====================================================
    // Scenario 8: GET /api/auth/me fails without a token
    // ====================================================
    console.log('\n--- Test 8: GET /api/auth/me Without Token ---');
    const noTokenRes = await fetch(`${baseUrl}/api/auth/me`);
    const noTokenData = await noTokenRes.json();
    assert(noTokenRes.status === 401, 'GET /api/auth/me without token returns HTTP 401');
    assert(noTokenData.success === false, 'No-token request returns success = false');

    // ====================================================
    // Scenario 9: GET /api/auth/me succeeds with a valid token
    // ====================================================
    console.log('\n--- Test 9: GET /api/auth/me With Valid Token ---');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    const meData = await meRes.json();
    assert(meRes.status === 200, 'GET /api/auth/me returns HTTP 200');
    assert(meData.success === true, 'Response indicates success = true');
    assert(meData.user.email === testUser.email.toLowerCase(), 'Returned profile email matches authenticated user');
    assert(meData.user.name === testUser.name, 'Returned profile name matches authenticated user');
    assert(meData.user.password === undefined, 'Profile does NOT contain password hash');

    // ====================================================
    // Scenario 10: GET /api/auth/me rejects an invalid or expired token
    // ====================================================
    console.log('\n--- Test 10: GET /api/auth/me With Invalid / Expired Token ---');
    const invalidTokenRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: 'Bearer invalid.token.signature_here',
      },
    });
    const invalidTokenData = await invalidTokenRes.json();
    assert(invalidTokenRes.status === 401, 'Invalid token returns HTTP 401');
    assert(invalidTokenData.success === false, 'Invalid token returns success = false');

    // Clean up created test user in test database
    await User.deleteMany({ email: { $regex: /@taskflow-test\.com$/ } });

    console.log('\n====================================================');
    console.log(`📊 Test Summary: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test execution:', err);
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
