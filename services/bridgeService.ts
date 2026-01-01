export const shareContent = async (content: string): Promise<string> => {
  // Check for Android Interface (NativeShare)
  if (window.NativeShare && typeof window.NativeShare.postMessage === 'function') {
    window.NativeShare.postMessage(content);
    return "Sent to Native App";
  } 
  
  // Fallback: Copy to Clipboard (Browser)
  try {
    await navigator.clipboard.writeText(content);
    return "Copied to Clipboard";
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return "Failed to share";
  }
};

// Hàm gửi tín hiệu sang Kodular
export const sendNativeSignal = (type: 'RING_START' | 'RING_STOP' | 'VIBRATE_MSG') => {
  if (window.AppInventor && typeof window.AppInventor.setWebViewString === 'function') {
    // Gửi chuỗi đơn giản để Kodular Blocks dễ xử lý
    window.AppInventor.setWebViewString(type);
    console.log("Sent to Kodular:", type);
  } else {
    console.log("Not in Kodular WebView:", type);
  }
};