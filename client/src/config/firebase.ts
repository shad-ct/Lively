import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  type Auth
} from 'firebase/auth';

// Lazy initialized auth variable
export let auth: Auth;
export const googleProvider = new GoogleAuthProvider();

// Set up Google provider properties
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const initializeFirebase = (config: any) => {
  if (getApps().length === 0) {
    const app = initializeApp(config);
    auth = getAuth(app);
  } else {
    auth = getAuth(getApp());
  }
  return auth;
};

export { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut 
};
