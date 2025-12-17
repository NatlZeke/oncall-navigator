import { MainLayout } from '@/components/MainLayout';
import { mockOffices, mockShifts } from '@/data/mockData';
import { Building2, MapPin, Phone, Plus, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import { useNavigate } from 'react-router-dom';

const OfficesPage = () => {
  const { setCurrentOffice, setIsCompanyLevel } = useApp();
  const navigate = useNavigate();

  const handleViewOffice = (office: typeof mockOffices[0]) => {
    setIsCompanyLevel(false);
    setCurrentOffice(office);
    navigate('/');
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Offices</h1>
            <p className="text-muted-foreground mt-1">Manage all office locations</p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Office
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockOffices.map((office) => {
            const officeShifts = mockShifts.filter((s) => s.office_id === office.id);
            const draftCount = officeShifts.filter((s) => s.status === 'draft').length;
            const publishedCount = officeShifts.filter((s) => s.status === 'published').length;

            return (
              <div
                key={office.id}
                className="group rounded-xl border bg-card p-5 hover:shadow-lg transition-all cursor-pointer"
                onClick={() => handleViewOffice(office)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <Badge variant={office.status === 'active' ? 'default' : 'secondary'}>
                    {office.status}
                  </Badge>
                </div>

                <h3 className="text-lg font-semibold mb-1">{office.name}</h3>
                
                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{office.timezone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">{office.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{office.phone_main}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {publishedCount} published
                    </Badge>
                    {draftCount > 0 && (
                      <Badge variant="outline" className="text-xs border-warning text-warning">
                        {draftCount} draft
                      </Badge>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
};

export default OfficesPage;
