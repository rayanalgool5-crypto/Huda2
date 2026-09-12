#!/usr/bin/env node

/**
 * Quick test script to verify all API endpoints
 * Usage: node test-api.js
 */

const baseUrl = 'http://localhost:3000/api';
let sessionCookie = '';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function test(name, method, url, body = null) {
  try {
    log(`\n► ${name}`, 'blue');

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    if (sessionCookie) {
      options.headers.Cookie = sessionCookie;
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      log(`✓ ${response.status} OK`, 'green');
      if (response.headers.get('set-cookie')) {
        sessionCookie = response.headers.get('set-cookie').split(';')[0];
      }
    } else {
      log(`✗ ${response.status} Error`, 'red');
    }

    console.log(JSON.stringify(data, null, 2));
    return response.ok;
  } catch (error) {
    log(`✗ Failed: ${error.message}`, 'red');
    return false;
  }
}

async function runTests() {
  log('\n=== Huda API Test Suite ===\n', 'yellow');

  // Test 1: Health check
  await test('Health Check', 'GET', `${baseUrl}/health`);

  // Test 2: Register
  const randomEmail = `test${Date.now()}@example.com`;
  await test(
    'Register New User',
    'POST',
    `${baseUrl}/auth/register`,
    {
      name: 'محمد الاختبار',
      email: randomEmail,
      password: 'test@123456',
    }
  );

  // Test 3: Session must remain unauthenticated until email verification
  await test('Get Session (unverified)', 'GET', `${baseUrl}/auth/session`);

  // Test 4: Protected progress must reject unverified accounts
  await test('Get Tasbeeh Progress (blocked before verification)', 'GET', `${baseUrl}/progress/tasbeeh`);

  // Test 5: Update Tasbeeh Progress must also be blocked
  await test(
    'Update Tasbeeh Progress (blocked before verification)',
    'PUT',
    `${baseUrl}/progress/tasbeeh`,
    {
      count: 100,
      total: 1000,
      sound: true,
      vibration: false,
    }
  );

  // Test 6: Get Reading Progress
  await test('Get Reading Progress', 'GET', `${baseUrl}/progress/reading`);

  // Test 7: Update Reading Progress
  await test(
    'Update Reading Progress',
    'PUT',
    `${baseUrl}/progress/reading`,
    {
      surah: 1,
      verse: 5,
    }
  );

  // Test 8: Login must reject unverified account
  await test(
    'Login (blocked before verification)',
    'POST',
    `${baseUrl}/auth/login`,
    {
      email: randomEmail,
      password: 'test@123456',
    }
  );

  // Test 9: Logout
  await test('Logout', 'POST', `${baseUrl}/auth/logout`);

  log('\n=== Test Suite Complete ===\n', 'yellow');
}

log('Starting API tests...', 'blue');
log('Make sure the server is running: npm run dev', 'yellow');

setTimeout(() => {
  runTests().catch((error) => {
    log(`Fatal error: ${error.message}`, 'red');
    process.exit(1);
  });
}, 1000);
