const mysql = require('mysql2/promise');

// Create MySQL connection pool (better for serverless)
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mysql-205300-0.cloudclusters.net',
  port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 10037,
  user: process.env.MYSQL_USER || 'admin',
  password: process.env.MYSQL_PASSWORD || 'dCDlAyb5',
  database: process.env.MYSQL_DATABASE || 'qrlogix',
  connectionLimit: 10,
  waitForConnections: true,
  connectTimeout: 60000,
  timezone: '+08:00'
});

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint } = req.query;

  try {
    // TEST ENDPOINT - Check if API is working with detailed env info
    if (endpoint === 'test' && req.method === 'GET') {
      const envInfo = {
        hasHost: !!process.env.MYSQL_HOST,
        hasPort: !!process.env.MYSQL_PORT,
        hasUser: !!process.env.MYSQL_USER,
        hasPassword: !!process.env.MYSQL_PASSWORD,
        hasDatabase: !!process.env.MYSQL_DATABASE,
        host: process.env.MYSQL_HOST || 'NOT SET - using fallback: mysql-205300-0.cloudclusters.net',
        port: process.env.MYSQL_PORT || 'NOT SET - using fallback: 10037',
        database: process.env.MYSQL_DATABASE || 'NOT SET - using fallback: qrlogix',
        user: process.env.MYSQL_USER || 'NOT SET - using fallback: admin'
      };

      // Test database connection
      let dbStatus = 'Not tested';
      try {
        const connection = await pool.getConnection();
        dbStatus = 'Connected successfully!';
        connection.release();
      } catch (dbError) {
        dbStatus = `Connection failed: ${dbError.message}`;
      }

      return res.status(200).json({
        success: true,
        message: 'API is working! (Updated version with full diagnostics)',
        timestamp: new Date().toISOString(),
        version: '2.0',
        envCheck: envInfo,
        databaseConnection: dbStatus
      });
    }

    // SIGNUP ENDPOINT - Create new user
    if (endpoint === 'signup' && req.method === 'POST') {
      const { firstName, lastName, email, password } = req.body;

      console.log('Signup attempt for:', email);
      console.log('Using database:', process.env.MYSQL_DATABASE || 'qrlogix (fallback)');

      // Validate input
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required',
        });
      }

      let connection;
      try {
        // Get connection from pool
        connection = await pool.getConnection();
        console.log('Database connected successfully');

        // Check if email already exists
        const [existingUsers] = await connection.execute(
          'SELECT * FROM user WHERE email = ?',
          [email]
        );

        if (existingUsers.length > 0) {
          connection.release();
          return res.status(400).json({
            success: false,
            message: 'Email already exists',
          });
        }

        // Insert new user
        const [result] = await connection.execute(
          'INSERT INTO user (first_name, last_name, email, password, user_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
          [firstName, lastName, email, password, 'user']
        );

        connection.release();
        console.log('User created successfully:', result.insertId);

        return res.status(201).json({
          success: true,
          message: 'User created successfully',
          userId: result.insertId,
        });
      } catch (dbError) {
        if (connection) connection.release();
        console.error('Database error:', dbError);
        return res.status(500).json({
          success: false,
          message: 'Database error',
          error: dbError.message,
          code: dbError.code
        });
      }
    }

    // LOGIN ENDPOINT - Authenticate user
    if (endpoint === 'login' && req.method === 'POST') {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      let connection;
      try {
        connection = await pool.getConnection();

        const [users] = await connection.execute(
          'SELECT * FROM user WHERE email = ? AND password = ?',
          [email, password]
        );

        connection.release();

        if (users.length === 0) {
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password',
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Login successful',
          user: {
            id: users[0].user_id,
            firstName: users[0].first_name,
            lastName: users[0].last_name,
            email: users[0].email,
            userType: users[0].user_type,
          },
        });
      } catch (dbError) {
        if (connection) connection.release();
        console.error('Database error:', dbError);
        return res.status(500).json({
          success: false,
          message: 'Database error',
          error: dbError.message,
        });
      }
    }

    // If no endpoint matches
    return res.status(404).json({
      success: false,
      message: 'Endpoint not found',
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};