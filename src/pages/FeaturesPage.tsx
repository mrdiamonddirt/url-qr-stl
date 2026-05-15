import { IonCard, IonCardContent, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/react";
import AppFooter from "../components/AppFooter";
import "./SeoPages.css";

const FeaturesPage: React.FC = () => {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Features</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="seo-page">
        <div className="seo-page__wrap">
          <section className="seo-page__hero">
            <p className="seo-page__kicker">Free + Premium</p>
            <h1>Free QR maker with auto conversion to STL or OBJ 3D model exports</h1>
            <p>
              URL 2 STL helps makers and product teams convert links into QR assets, render previews, and export print-ready geometry without switching tools.
            </p>
          </section>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Core workflow</h2>
              <ul>
                <li>Auto-generate a short URL and QR code from any destination link.</li>
                <li>Customize template styling, color, and layout for your product or packaging.</li>
                <li>Render a 3D model preview before final export.</li>
                <li>Download STL or OBJ files for 3D print and fabrication pipelines.</li>
              </ul>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Free tier value</h2>
              <p>
                Start free to validate your QR conversion workflow, test printability, and prepare production-ready models before upgrading.
              </p>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>High-intent use cases for search queries</h2>
              <ul>
                <li>Free QR code maker for 3D printing projects and packaging links.</li>
                <li>Auto URL conversion for maker teams that need fast prototype loops.</li>
                <li>URL to OBJ converter workflows when external render tools are required.</li>
                <li>Print-ready STL export for slicer-first production pipelines.</li>
              </ul>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Format and production guidance</h2>
              <p>
                Use STL for direct print execution and OBJ for broader 3D model compatibility. Both formats support QR-driven physical link workflows with predictable render previews.
              </p>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Explore more</h2>
              <div className="seo-link-row">
                <a href="/#/editor">Open Editor</a>
                <a href="/#/faq">Read FAQ</a>
                <a href="/#/guides">View Guides</a>
              </div>
            </IonCardContent>
          </IonCard>
        </div>
        <AppFooter />
      </IonContent>
    </IonPage>
  );
};

export default FeaturesPage;
