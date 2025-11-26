import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FluxosConfigDialog } from '@/components/FluxosConfigDialog';
import { StatusConfigDialog } from '@/components/StatusConfigDialog';

interface WorkflowConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigChange: () => void;
}

export function WorkflowConfigDialog({ open, onOpenChange, onConfigChange }: WorkflowConfigDialogProps) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Configurar Fluxos e Status</DialogTitle>
          <DialogDescription>
            Configure os fluxos de trabalho e status do sistema
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="fluxos" className="w-full h-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="fluxos">Fluxos</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
          </TabsList>
          
          <TabsContent value="fluxos" className="mt-0 h-[calc(90vh-180px)]">
            <FluxosConfigDialog 
              open={open}
              onOpenChange={onOpenChange}
              onFluxoChange={onConfigChange}
              embedded
            />
          </TabsContent>
          
          <TabsContent value="status" className="mt-0 h-[calc(90vh-180px)]">
            <StatusConfigDialog 
              open={open}
              onOpenChange={onOpenChange}
              onStatusChange={onConfigChange}
              embedded
            />
          </TabsContent>
        </Tabs>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
