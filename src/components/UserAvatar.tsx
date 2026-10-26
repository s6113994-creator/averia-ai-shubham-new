import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Props {
  url?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

export function UserAvatar({ url, name, size = 'md', className = '' }: Props) {
  const initial = (name?.trim()?.[0] || '?').toUpperCase();
  return (
    <Avatar className={`${SIZE[size]} ring-2 ring-primary/30 shadow ${className}`}>
      {url ? <AvatarImage src={url} alt={name || 'user'} /> : null}
      <AvatarFallback className="bg-gradient-to-br from-primary to-fuchsia-600 text-primary-foreground font-bold">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
