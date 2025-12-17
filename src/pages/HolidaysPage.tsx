import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getHolidayTemplatesForOffice, mockCompany } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Plus, Building2, Globe, Trash2, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { HolidayTemplate, Holiday } from '@/types';

const HolidaysPage = () => {
  const { currentOffice, currentCompany } = useApp();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<HolidayTemplate | null>(null);

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const templates = getHolidayTemplatesForOffice(currentOffice.id, currentCompany?.id || '');

  const companyTemplates = templates.filter(t => t.company_id && !t.office_id);
  const officeTemplates = templates.filter(t => t.office_id);

  const handleApplyTemplate = (template: HolidayTemplate) => {
    toast.success('Holiday template applied', {
      description: `${template.holidays.length} holidays will be marked on the calendar`
    });
  };

  const handleDeleteTemplate = (template: HolidayTemplate) => {
    toast.success('Holiday template deleted');
  };

  const TemplateCard = ({ template }: { template: HolidayTemplate }) => {
    const isCompanyWide = !!template.company_id && !template.office_id;
    const upcomingHolidays = template.holidays.filter(h => new Date(h.date) >= new Date()).slice(0, 3);
    
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {isCompanyWide ? (
                <Globe className="h-5 w-5 text-primary" />
              ) : (
                <Building2 className="h-5 w-5 text-accent" />
              )}
              <div>
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <CardDescription>
                  {isCompanyWide ? 'Company-wide template' : 'Office-specific template'}
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">{template.holidays.length} holidays</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upcoming Holidays Preview */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Next holidays:</p>
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming holidays in this template</p>
            ) : (
              <div className="space-y-1">
                {upcomingHolidays.map((holiday, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{holiday.label}</span>
                    <span className="text-muted-foreground">{format(new Date(holiday.date), 'MMM d')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={() => handleApplyTemplate(template)} className="flex-1">
              Apply to Calendar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedTemplate(template)}>
              <Edit2 className="h-4 w-4" />
            </Button>
            {!isCompanyWide && (
              <Button size="sm" variant="outline" onClick={() => handleDeleteTemplate(template)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Holiday Coverage</h1>
            <p className="text-muted-foreground mt-1">Manage holiday templates and special coverage rules</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Holiday Template</DialogTitle>
                <DialogDescription>Define a set of holidays for coverage planning.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input placeholder="e.g., 2025 Office Holidays" />
                </div>
                <div className="space-y-2">
                  <Label>Add Holidays</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Date</Label>
                      <Input type="date" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Label</Label>
                      <Input placeholder="Holiday name" />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="mt-2 w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Holiday
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Coverage Rules</Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="weekend-rules" />
                    <label htmlFor="weekend-rules" className="text-sm">
                      Apply weekend coverage rules to holidays
                    </label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => { setIsCreateDialogOpen(false); toast.success('Holiday template created'); }}>
                  Create Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Company-wide Templates */}
        {companyTemplates.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Company-wide Templates
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {companyTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          </div>
        )}

        {/* Office Templates */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Office Templates
          </h2>
          {officeTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No office-specific templates created yet</p>
                <p className="text-sm mt-1">Create a template to define custom holidays for this office</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {officeTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Holidays Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Holidays (All Templates)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {templates
                .flatMap(t => t.holidays.map(h => ({ ...h, templateName: t.name })))
                .filter(h => new Date(h.date) >= new Date())
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .slice(0, 10)
                .map((holiday, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {format(new Date(holiday.date), 'd')}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{holiday.label}</p>
                        <p className="text-sm text-muted-foreground">{holiday.templateName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{format(new Date(holiday.date), 'EEEE')}</p>
                      <p className="text-sm text-muted-foreground">{format(new Date(holiday.date), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default HolidaysPage;
