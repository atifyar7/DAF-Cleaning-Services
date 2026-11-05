import { getImageProps } from "next/image";

type PhotoProps = {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
};

/**
 * Optimised image that fills its positioned parent. Next's inline styles are removed because
 * the security policy blocks them, so positioning comes from classes instead.
 */
export function Photo({ src, alt, sizes, priority, className = "" }: PhotoProps) {
  const { style, ...props } = getImageProps({ src, alt, sizes, priority, fill: true }).props;
  void style;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} className={`absolute inset-0 h-full w-full object-cover ${className}`} />;
}
