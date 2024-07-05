import { Container } from "@/components/ui/container";

export function SiteFooter() {
  return (
    <footer className="border-border mt-16 border-t pt-8 pb-24 md:pb-8">
      <Container className="text-muted-foreground flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>Quiz Atlas — a quiz game for curious people.</p>
        <p>No accounts needed to play. Progress syncs when you sign up.</p>
      </Container>
    </footer>
  );
}
