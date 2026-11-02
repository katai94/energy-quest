// 1) สร้างโปรเจกต์ Firebase และเปิด Realtime Database
// 2) คัดลอก config จาก Project settings > Your apps มาใส่ด้านล่าง
// 3) อย่าเผยแพร่ service account key หรือ private key ในไฟล์นี้
window.FIREBASE_CONFIG = {
  apiKey: "ใส่-apiKey",
  authDomain: "ใส่-project.firebaseapp.com",
  databaseURL: "https://ใส่-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ใส่-project",
  storageBucket: "ใส่-project.appspot.com",
  messagingSenderId: "ใส่-sender-id",
  appId: "ใส่-app-id"
};