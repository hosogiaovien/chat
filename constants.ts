// 1. Dán URL Google Apps Script bạn vừa copy ở Bước 2 (Phần Deployment) vào đây:
export const GAS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzTIVBXFGJDzSaryeolJn-sMEfrWm4wU5zuybUo9MtWsyxxCr8lnvsDy_VB44djek7J/exec";

// 2. Cấu hình Firebase (Đã cập nhật theo thông tin bạn cung cấp)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA_j_QneGjWHlM8D1kfKgqhkbB6MX_kD3Y",
  authDomain: "cungchat-web.firebaseapp.com",
  
  // QUAN TRỌNG: Cập nhật đúng region asia-southeast1 theo warning của Firebase
  databaseURL: "https://cungchat-web-default-rtdb.asia-southeast1.firebasedatabase.app",
  
  projectId: "cungchat-web",
  storageBucket: "cungchat-web.firebasestorage.app",
  messagingSenderId: "58565332026",
  appId: "1:58565332026:web:0f57549980d5e1a0a27903"
};

// Màu sắc thương hiệu Zalo (Giữ nguyên)
export const COLORS = {
  primary: '#0068FF', // Zalo Blue
  secondary: '#E5E7EB',
  messageMe: '#E5F0FF',
  messageOther: '#FFFFFF',
};