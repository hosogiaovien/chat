import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { firebaseAuth, syncUserToDB } from '../services/firebaseService';
import { COLORS } from '../constants';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/solid';

const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleMode = () => {
      setIsLogin(!isLogin);
      setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      } else {
        userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      }

      // Sync user to DB for Admin listing
      if (userCredential.user) {
          await syncUserToDB({
              uid: userCredential.user.uid,
              email: userCredential.user.email
          });
      }

    } catch (err: any) {
      console.error(err);
      let msg = err.message || "Đã có lỗi xảy ra.";
      
      // Translate common error codes
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/user-not-found') || msg.includes('auth/wrong-password')) {
          msg = "Email hoặc mật khẩu không chính xác.";
      } else if (msg.includes('auth/email-already-in-use')) {
          msg = "Email này đã được sử dụng.";
      } else if (msg.includes('auth/weak-password')) {
          msg = "Mật khẩu quá yếu (cần ít nhất 6 ký tự).";
      } else if (msg.includes('auth/too-many-requests')) {
          msg = "Quá nhiều lần thử thất bại. Vui lòng thử lại sau.";
      } else if (msg.includes('auth/network-request-failed')) {
          msg = "Lỗi kết nối mạng. Vui lòng kiểm tra internet.";
      }

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold" style={{ color: COLORS.primary }}>Cùng chat</h2>
            <p className="text-gray-500 mt-2">Kết nối bạn bè ngay lập tức</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Mật khẩu</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <EyeIcon className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error && <div className="text-red-500 text-sm text-center font-semibold bg-red-50 p-2 rounded">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{ backgroundColor: COLORS.primary }}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : (isLogin ? 'Đăng nhập' : 'Đăng ký')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={toggleMode}
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            {isLogin ? "Chưa có tài khoản? Đăng ký ngay" : "Đã có tài khoản? Đăng nhập"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;