export const metadata = {
  title: "OU Predictor",
  description: "Mini web chạy dự đoán Over/Under",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, Arial, sans-serif", background: "#f6f7f9" }}>
        {children}
      </body>
    </html>
  );
}
