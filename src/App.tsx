import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AdminRoute } from "@/auth/AdminRoute";
import Dashboard from "./pages/Dashboard";
import DataLandingPage from "./pages/DataLandingPage";
import DataPage from "./pages/DataPage";
import SPCPage from "./pages/SPCPage";
import CapabilityPage from "./pages/CapabilityPage";
import MSAPage from "./pages/MSAPage";
import UncertaintyPage from "./pages/UncertaintyPage";
import ReportsPage from "./pages/ReportsPage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/data"
              element={
                <ProtectedRoute>
                  <DataLandingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/data/spc"
              element={
                <ProtectedRoute>
                  <DataPage mode="spc" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/data/msa"
              element={
                <ProtectedRoute>
                  <DataPage mode="msa" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/spc"
              element={
                <ProtectedRoute>
                  <SPCPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/capability"
              element={
                <ProtectedRoute>
                  <CapabilityPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/msa"
              element={
                <ProtectedRoute>
                  <MSAPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/uncertainty"
              element={
                <ProtectedRoute>
                  <UncertaintyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <AdminPage />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
