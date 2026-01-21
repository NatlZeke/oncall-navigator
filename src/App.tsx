import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import CalendarPage from "./pages/CalendarPage";
import OperatorView from "./pages/OperatorView";
import OfficesPage from "./pages/OfficesPage";
import UsersPage from "./pages/UsersPage";
import ServiceLinesPage from "./pages/ServiceLinesPage";
import EscalationPage from "./pages/EscalationPage";
import PublishPage from "./pages/PublishPage";
import AuditPage from "./pages/AuditPage";
import AvailabilityPage from "./pages/AvailabilityPage";
import MyShiftsPage from "./pages/MyShiftsPage";
import SwapRequestsPage from "./pages/SwapRequestsPage";
import HolidaysPage from "./pages/HolidaysPage";
import EscalationManagementPage from "./pages/EscalationManagementPage";
import SettingsPage from "./pages/SettingsPage";
import CredentialingPage from "./pages/CredentialingPage";
import CrossCoveragePage from "./pages/CrossCoveragePage";
import BillingPage from "./pages/BillingPage";
import CompliancePage from "./pages/CompliancePage";
import TwilioSettingsPage from "./pages/TwilioSettingsPage";
import AfterHoursSchedulePage from "./pages/AfterHoursSchedulePage";
import CallLogsPage from "./pages/CallLogsPage";
import SLADashboardPage from "./pages/SLADashboardPage";
import ComplianceCenterPage from "./pages/ComplianceCenterPage";
import CallAnalyticsDashboardPage from "./pages/CallAnalyticsDashboardPage";
import PrescriptionQueuePage from "./pages/PrescriptionQueuePage";
import ProviderRoutingPage from "./pages/ProviderRoutingPage";
import AuthorizedUsersPage from "./pages/AuthorizedUsersPage";
import IntakeFlowReviewPage from "./pages/IntakeFlowReviewPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AppProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/intake-flow" element={<IntakeFlowReviewPage />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
              <Route path="/operator" element={<ProtectedRoute><OperatorView /></ProtectedRoute>} />
              <Route path="/offices" element={<ProtectedRoute><OfficesPage /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
              <Route path="/service-lines" element={<ProtectedRoute><ServiceLinesPage /></ProtectedRoute>} />
              <Route path="/escalation" element={<ProtectedRoute><EscalationPage /></ProtectedRoute>} />
              <Route path="/publish" element={<ProtectedRoute><PublishPage /></ProtectedRoute>} />
              <Route path="/audit" element={<ProtectedRoute><AuditPage /></ProtectedRoute>} />
              <Route path="/availability" element={<ProtectedRoute><AvailabilityPage /></ProtectedRoute>} />
              <Route path="/my-shifts" element={<ProtectedRoute><MyShiftsPage /></ProtectedRoute>} />
              <Route path="/swap-requests" element={<ProtectedRoute><SwapRequestsPage /></ProtectedRoute>} />
              <Route path="/holidays" element={<ProtectedRoute><HolidaysPage /></ProtectedRoute>} />
              <Route path="/escalation-management" element={<ProtectedRoute><EscalationManagementPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/credentialing" element={<ProtectedRoute><CredentialingPage /></ProtectedRoute>} />
              <Route path="/cross-coverage" element={<ProtectedRoute><CrossCoveragePage /></ProtectedRoute>} />
              <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
              <Route path="/compliance" element={<ProtectedRoute><CompliancePage /></ProtectedRoute>} />
              <Route path="/twilio" element={<ProtectedRoute><TwilioSettingsPage /></ProtectedRoute>} />
              <Route path="/after-hours" element={<ProtectedRoute><AfterHoursSchedulePage /></ProtectedRoute>} />
              <Route path="/call-logs" element={<ProtectedRoute><CallLogsPage /></ProtectedRoute>} />
              <Route path="/sla-dashboard" element={<ProtectedRoute><SLADashboardPage /></ProtectedRoute>} />
              <Route path="/compliance-center" element={<ProtectedRoute><ComplianceCenterPage /></ProtectedRoute>} />
              <Route path="/call-analytics" element={<ProtectedRoute><CallAnalyticsDashboardPage /></ProtectedRoute>} />
              <Route path="/prescription-queue" element={<ProtectedRoute><PrescriptionQueuePage /></ProtectedRoute>} />
              <Route path="/provider-routing" element={<ProtectedRoute><ProviderRoutingPage /></ProtectedRoute>} />
              <Route path="/authorized-users" element={<ProtectedRoute><AuthorizedUsersPage /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
