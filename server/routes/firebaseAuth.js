import express from 'express';
import { firebaseLogin, logout, getFirebaseConfig, completeProfileSetup } from '../controllers/firebaseAuthController.js';

const router = express.Router();

router.get('/config', getFirebaseConfig);
router.post('/firebase', firebaseLogin);
router.post('/logout', logout);
router.post('/complete-setup', completeProfileSetup);

export default router;
