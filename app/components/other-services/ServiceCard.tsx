interface ServiceCardProps {
  title: string;
  description: string;
  className?: string;
}

export default function ServiceCard({ title, description, className }: ServiceCardProps) {
  return (
    <li className={className}>
      <h3 className="font-Zilla-Slab text-3xl font-bold">{title}</h3>
      <p className="font-Zilla-Slab text-lg font-semibold">{description}</p>
    </li>
  );
}
