import { GAS_SCRIPT_URL } from '../constants';

interface GASUploadResponse {
    status: 'success' | 'error';
    url?: string;
    viewLink?: string;
    filename?: string;
    message?: string;
    folder?: string;
}

export const uploadImageToGAS = async (file: File): Promise<{ url: string, viewLink: string, filename: string }> => {
  if (GAS_SCRIPT_URL.includes("YOUR_GOOGLE_APPS_SCRIPT")) {
    throw new Error("Vui lòng cấu hình GAS_SCRIPT_URL trong file constants.ts");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
      try {
        const base64Content = reader.result?.toString().split(',')[1];
        const currentYear = new Date().getFullYear();
        const dynamicFolderName = `Chat_Files_${currentYear}`;

        const payload = {
            action: 'upload', // Explicit action
            filename: file.name,
            mimeType: file.type,
            base64: base64Content,
            folderName: dynamicFolderName
        };

        const response = await fetch(GAS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow',
          credentials: 'omit',
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
        }

        const data: GASUploadResponse = await response.json();
        
        if (data.status === 'success' && data.url) {
          console.log(`Uploaded to folder: ${data.folder}`);
          resolve({ 
              url: data.url, 
              viewLink: data.viewLink || data.url, 
              filename: data.filename || file.name 
          });
        } else {
          console.error("GAS Error Response:", data);
          reject(new Error(data.message || "Script trả về lỗi không xác định."));
        }
      } catch (e: any) {
        console.error("Upload Failed:", e);
        reject(new Error("Lỗi kết nối (CORS) hoặc Script bị lỗi."));
      }
    };

    reader.onerror = () => reject(new Error("Lỗi đọc file từ trình duyệt"));
  });
};

export const deleteFileFromGAS = async (fileUrl: string): Promise<boolean> => {
    // Extract ID from URL
    const match = fileUrl.match(/id=([a-zA-Z0-9_-]+)/) || fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : null;

    if (!fileId) return false;

    try {
        const payload = {
            action: 'delete',
            fileId: fileId
        };

        const response = await fetch(GAS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow',
        });

        const data = await response.json();
        return data.status === 'success';
    } catch (e) {
        console.error("Delete Failed:", e);
        return false;
    }
};