export function PromoBanner({ campaign }) {
  return (
    <div className="promo-banner">
      <img src={campaign.heroImage} alt={campaign.title} />
      <h2>{campaign.title}</h2>
      <p>{campaign.subtitle}</p>
      <button type="button">Buy now</button>
    </div>
  );
}
