import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

// Initialize Firebase Admin SDK using the Project ID
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0452899165',
  });
}

export const firebaseLogin = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Firebase ID token is required.' });
  }

  try {
    // 1. Verify the ID token securely using Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid: firebaseUid, email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({ error: 'Email is required from the token.' });
    }

    // 2. Query or create the user in MongoDB
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        firebaseUid,
        email,
        name: name || email.split('@')[0],
        picture: picture || '',
        role: 'attendee', // default role is attendee
        needsProfileSetup: false,
      });
      await user.save();
      console.log(`New user registered via Firebase: ${email}`);
    } else {
      // Sync details if needed
      user.firebaseUid = firebaseUid;
      if (name && !user.name) user.name = name;
      if (picture && !user.picture) user.picture = picture;
      await user.save();
      console.log(`User logged in via Firebase: ${email}`);
    }

    // 3. Sign a custom JWT containing user ID and role for WebSockets authentication
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'SECRET_JWT_KEY',
      { expiresIn: '24h' }
    );

    const isProduction = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';

    // 4. Store JWT and profile data as cookies
    // HTTP-only cookie for secure JWT storage (prevents XSS attacks from reading the token)
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Client-readable cookie for user details so React can parse it on reload
    res.cookie('user', JSON.stringify({
      name: user.name,
      email: user.email,
      picture: user.picture || '',
      role: user.role,
      needsProfileSetup: user.needsProfileSetup || false,
    }), {
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Send JSON response
    res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        picture: user.picture || '',
        role: user.role,
        needsProfileSetup: user.needsProfileSetup || false,
      }
    });
  } catch (error) {
    console.error('Firebase Auth login controller error:', error);
    
    // Check if it's a token validation or signature error from Firebase Auth Admin SDK
    const isAuthError = error.codePrefix === 'auth' || (error.code && typeof error.code === 'string' && error.code.startsWith('auth/')) || error.message?.includes('token') || error.message?.includes('JWT');
    const statusCode = isAuthError ? 401 : 500;

    res.status(statusCode).json({
      error: isAuthError ? 'Invalid or expired Firebase ID token.' : 'Authentication failed.',
      details: error.message || String(error)
    });
  }
};

export const completeProfileSetup = async (req, res) => {
  const { name, picture } = req.body;
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. No session token found.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SECRET_JWT_KEY');
    const userId = decoded.userId;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.name = name.trim();
    if (picture) {
      user.picture = picture;
    }
    user.needsProfileSetup = false;
    await user.save();

    // Re-sign token
    const newToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'SECRET_JWT_KEY',
      { expiresIn: '24h' }
    );

    res.cookie('token', newToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('user', JSON.stringify({
      name: user.name,
      email: user.email,
      picture: user.picture || '',
      role: user.role,
      needsProfileSetup: false,
    }), {
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        picture: user.picture || '',
        role: user.role,
        needsProfileSetup: false,
      }
    });
  } catch (error) {
    console.error('completeProfileSetup error:', error);
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
};

export const logout = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  const baseOptions = {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };
  // Clear the cookies
  res.clearCookie('token', { ...baseOptions, httpOnly: true });
  res.clearCookie('user', baseOptions);
  res.json({ success: true, message: 'Logged out successfully.' });
};

export const getFirebaseConfig = (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
};
