import { useState } from 'react';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

interface WorkflowConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigChange: () => void;
}

export function WorkflowConfigDialog({ open, onOpenChange, onConfigChange }: WorkflowConfigDialogProps) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Configurar Fluxos e Status</DialogTitle>
          <DialogDescription>
            Configure os fluxos de trabalho e status do sistema
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="fluxos" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="fluxos">Fluxos</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
          </TabsList>
          
          <TabsContent value="fluxos" className="mt-0">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Fluxos configuration content will be displayed here.</p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="status" className="mt-0">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Status configuration content will be displayed here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
