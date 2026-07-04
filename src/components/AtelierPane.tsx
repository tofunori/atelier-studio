export default function AtelierPane({ url }: { url: string }) {
  return <iframe className="atelier" src={url} title="atelier" />;
}
