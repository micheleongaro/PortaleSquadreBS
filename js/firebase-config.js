// Configurazione del tuo progetto Firebase "PortaleSquadreBS".
// Questi dati NON sono segreti: servono al sito per collegarsi a Firebase.
// La sicurezza è garantita dalle regole in firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyCQam3lourgPfYFPs-p03xpwY-DgW-oGKM",
  authDomain: "portalesquadrebs.firebaseapp.com",
  databaseURL: "https://portalesquadrebs-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "portalesquadrebs",
  storageBucket: "portalesquadrebs.firebasestorage.app",
  messagingSenderId: "248600378554",
  appId: "1:248600378554:web:6cf764d5b2fbabc9009683",
  measurementId: "G-C7809HLB9F"
};

// Email dell'amministratore: chi si registra con questa email (verificata)
// ha automaticamente i poteri di amministratore.
// Se la cambi, cambiala anche in firestore.rules.
export const ADMIN_EMAIL = "michele.ongaro@gmail.com";
