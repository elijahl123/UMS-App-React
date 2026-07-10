import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Props {
  title: string;
}

function PlaceholderPage({ title }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">This section is coming soon.</p>
      </CardContent>
    </Card>
  );
}

export default PlaceholderPage;
