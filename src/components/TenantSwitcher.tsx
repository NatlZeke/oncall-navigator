import { Building2, ChevronDown, Check } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function TenantSwitcher() {
  const { currentCompany, currentOffice, offices, setCurrentOffice, isCompanyLevel, setIsCompanyLevel } = useApp();

  const handleSelectCompany = () => {
    setIsCompanyLevel(true);
    setCurrentOffice(null);
  };

  const handleSelectOffice = (office: typeof offices[0]) => {
    setIsCompanyLevel(false);
    setCurrentOffice(office);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2 px-2 py-1.5 text-left">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-xs text-muted-foreground">
              {isCompanyLevel ? 'Company' : 'Office'}
            </span>
            <span className="text-sm font-medium">
              {isCompanyLevel ? currentCompany?.name : currentOffice?.name}
            </span>
          </div>
          <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Company Console</DropdownMenuLabel>
        <DropdownMenuItem onClick={handleSelectCompany} className="gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <span>{currentCompany?.name}</span>
          {isCompanyLevel && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Office Consoles</DropdownMenuLabel>
        {offices.map((office) => (
          <DropdownMenuItem
            key={office.id}
            onClick={() => handleSelectOffice(office)}
            className="gap-2"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded bg-accent/20 text-accent">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm">{office.name}</span>
              <span className="text-xs text-muted-foreground">{office.timezone}</span>
            </div>
            {!isCompanyLevel && currentOffice?.id === office.id && (
              <Check className="ml-auto h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
