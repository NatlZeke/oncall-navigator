import { useApp } from '@/contexts/AppContext';
import { CompanyDashboard } from '@/components/dashboards/CompanyDashboard';
import { OfficeDashboard } from '@/components/dashboards/OfficeDashboard';
import { MainLayout } from '@/components/MainLayout';

const Index = () => {
  const { isCompanyLevel } = useApp();

  return (
    <MainLayout>
      {isCompanyLevel ? <CompanyDashboard /> : <OfficeDashboard />}
    </MainLayout>
  );
};

export default Index;
