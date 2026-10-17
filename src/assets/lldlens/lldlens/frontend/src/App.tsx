import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProblemBankPage } from "./features/problem-bank/ProblemBankPage";
import { PracticeSessionPage } from "./features/practice-session/PracticeSessionPage";
import { LoginPage } from "./features/auth/LoginPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/problems" element={<ProblemBankPage />} />
          <Route path="/practice/:problemId" element={<PracticeSessionPage />} />
          <Route path="/" element={<Navigate to="/problems" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
