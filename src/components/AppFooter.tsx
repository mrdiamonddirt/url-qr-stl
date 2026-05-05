import { IonText } from "@ionic/react";
import { APP_VERSION, BUILD_NUMBER } from "../version";
import "./AppFooter.css";

const YEAR = new Date().getFullYear();

const AppFooter: React.FC = () => (
  <footer className="app-footer">
    <IonText color="medium">
      <span>© {YEAR} URL QR STL. All rights reserved.</span>
      <span className="footer-sep">·</span>
      <a href="/url-qr-stl/terms">Terms &amp; Conditions</a>
      <span className="footer-sep">·</span>
      <span className="footer-version">v{APP_VERSION} build {BUILD_NUMBER}</span>
    </IonText>
  </footer>
);

export default AppFooter;
