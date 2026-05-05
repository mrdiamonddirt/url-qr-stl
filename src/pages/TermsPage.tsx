import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButton,
  IonBackButton,
  IonButtons,
} from "@ionic/react";
import AppFooter from "../components/AppFooter";

const YEAR = new Date().getFullYear();

const TermsPage: React.FC = () => (
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton defaultHref="/editor" />
        </IonButtons>
        <IonTitle>Terms &amp; Conditions</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent className="ion-padding">
      <h2>Terms &amp; Conditions</h2>
      <p><em>Last updated: {YEAR}</em></p>

      <h3>1. Service</h3>
      <p>
        URL QR STL ("the Service") allows you to create short URLs, QR codes, and 3D-printable
        STL files. The Service is provided as-is and may change or be withdrawn at any time.
      </p>

      <h3>2. Free plan</h3>
      <p>
        Free accounts are limited to 20 scans per short link. Once the limit is reached, the
        link is no longer active unless the account is upgraded to Premium.
      </p>

      <h3>3. Premium plan</h3>
      <p>
        Premium costs £3.99/month and removes the scan limit. Subscriptions are billed monthly
        and can be cancelled at any time. Cancellation takes effect at the end of the current
        billing period. Payments are processed by Stripe.
      </p>

      <h3>4. Acceptable use</h3>
      <p>
        You must not use the Service to shorten URLs that contain illegal content, malware,
        phishing, or anything that violates applicable law. We reserve the right to disable
        links that breach this policy without notice.
      </p>

      <h3>5. Data &amp; privacy</h3>
      <p>
        We store your email address (via Google OAuth), short link codes, destination URLs, and
        scan counts. This data is held in Supabase (EU region). We do not sell your data to
        third parties.
      </p>

      <h3>6. Liability</h3>
      <p>
        To the maximum extent permitted by law, URL QR STL is not liable for any indirect,
        incidental, or consequential damages arising from use of the Service.
      </p>

      <h3>7. Governing law</h3>
      <p>These terms are governed by the laws of England and Wales.</p>

      <h3>Contact</h3>
      <p>
        For questions, open an issue at{" "}
        <a href="https://github.com/mrdiamonddirt/url-qr-stl" target="_blank" rel="noreferrer">
          github.com/mrdiamonddirt/url-qr-stl
        </a>.
      </p>

      <IonButton fill="clear" routerLink="/editor">← Back to editor</IonButton>
      <AppFooter />
    </IonContent>
  </IonPage>
);

export default TermsPage;
