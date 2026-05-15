import { IonCard, IonCardContent, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/react";
import AppFooter from "../components/AppFooter";
import { SEO_FAQ_ITEMS } from "../constants/seoFaq";
import "./SeoPages.css";

const FaqPage: React.FC = () => {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>FAQ</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="seo-page">
        <div className="seo-page__wrap">
          <section className="seo-page__hero">
            <p className="seo-page__kicker">Common Questions</p>
            <h1>FAQ for free QR conversion, STL/OBJ export, render, and 3D print</h1>
            <p>
              These answers cover the most common maker and production questions about converting URLs into printable QR-based 3D models.
            </p>
          </section>

          {SEO_FAQ_ITEMS.map((item) => (
            <IonCard key={item.id} className="seo-card" id={item.id}>
              <IonCardContent>
                <h2>{item.question}</h2>
                <p>{item.answer}</p>
              </IonCardContent>
            </IonCard>
          ))}

          <IonCard className="seo-card">
            <IonCardContent>
              <h2>Explore more</h2>
              <div className="seo-link-row">
                <a href="/#/editor">Open Editor</a>
                <a href="/#/features">Compare Features</a>
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

export default FaqPage;
