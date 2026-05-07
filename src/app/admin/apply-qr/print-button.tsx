"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button
      variant="secondary"
      size="md"
      type="button"
      onClick={() => window.print()}
    >
      <Printer className="h-5 w-5" />
      인쇄
    </Button>
  );
}
