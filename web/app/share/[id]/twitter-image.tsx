// X reads twitter:image before og:image, and the site's own card would otherwise win here: the same
// card, drawn by the same code.
import OpenGraphImage from './opengraph-image';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A Bitcoin call on Renqun, settled on Mezo';
export const revalidate = 60;

export default function Image(props: { params: Promise<{ id: string }> }) {
  return OpenGraphImage(props);
}
