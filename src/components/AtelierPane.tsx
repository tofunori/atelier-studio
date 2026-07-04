export default function AtelierPane({ url }: { url: string }) {
  return (
    <div className="atelier-wrap">
      <iframe className="atelier" src={url} title="atelier" />
    </div>
  );
}
