import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const useEmulator = import.meta.env.VITE_USE_EMULATOR === '1';

const firebaseConfig = useEmulator
  ? { projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-storage-helper' }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

if (useEmulator) {
  const host = import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1';
  const port = Number(import.meta.env.VITE_EMULATOR_PORT || 8080);
  connectFirestoreEmulator(db, host, port);
}
