import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import Index from "./pages/Index";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/operator" element={<OperatorView />} />
            <Route path="/offices" element={<OfficesPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/service-lines" element={<ServiceLinesPage />} />
            <Route path="/escalation" element={<EscalationPage />} />
            <Route path="/publish" element={<PublishPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/availability" element={<AvailabilityPage />} />
            <Route path="/my-shifts" element={<MyShiftsPage />} />
            <Route path="/swap-requests" element={<SwapRequestsPage />} />
            <Route path="/holidays" element={<HolidaysPage />} />
            <Route path="/escalation-management" element={<EscalationManagementPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/credentialing" element={<CredentialingPage />} />
            <Route path="/cross-coverage" element={<CrossCoveragePage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/compliance" element={<CompliancePage />} />
            <Route path="/twilio" element={<TwilioSettingsPage />} />
            <Route path="/after-hours" element={<AfterHoursSchedulePage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
