import { IonCard, IonCardContent, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/react";
import AppFooter from "../components/AppFooter";
import "./SeoPages.css";

const GuidesPage: React.FC = () => {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Guides</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="seo-page">
        <div className="seo-page__wrap">
          <section className="seo-page__hero">
            <p className="seo-page__kicker">Maker Tutorials</p>
            <h1>Guides for URL conversion, QR creation, model render, and 3D print export</h1>
            <p>
              Follow practical steps to move from link input to final STL or OBJ output with fewer print errors and cleaner scan results.
            </p>
          </section>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Guide 1: Convert URL to QR and validate scan behavior</h2>
              <p>
                Start with a clean destination URL, generate your QR, and confirm mobile scan behavior before model export.
              </p>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Guide 2: Compose and render a 3D model preview</h2>
              <p>
                Tune template styling and geometry, then use render preview to catch legibility or thickness issues before final files.
              </p>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Guide 3: Export STL or OBJ for print-ready production</h2>
              <p>
                Choose STL for standard slicer workflows or OBJ for broader model pipelines, then verify scale and depth settings for your material.
              </p>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Guide 4: Free workflow for quick maker validation</h2>
              <p>
                If you are testing a free QR to STL concept, start with one target URL, render the model, and print a small-size sample to verify scan distance and contrast.
              </p>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Guide 5: Auto conversion checklist before final print</h2>
              <ul>
                <li>Confirm destination URL and redirect behavior.</li>
                <li>Render the 3D model preview and inspect edge clarity.</li>
                <li>Export STL or OBJ and validate dimensions in your toolchain.</li>
                <li>Print one prototype and test real-device QR scan reliability.</li>
              </ul>
            </IonCardContent>
          </IonCard>

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Explore more</h2>
              <div className="seo-link-row">
                <a href="/#/editor">Open Editor</a>
                <a href="/#/features">Compare Features</a>
                <a href="/#/faq">Read FAQ</a>
              </div>
            </IonCardContent>
          </IonCard>
        </div>
        <AppFooter />
      </IonContent>
    </IonPage>
  );
};

export default GuidesPage;
