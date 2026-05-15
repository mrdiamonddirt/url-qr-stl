import { IonText } from "@ionic/react";
import { APP_VERSION, BUILD_NUMBER } from "../version";
import "./AppFooter.css";

const YEAR = new Date().getFullYear();

const AppFooter: React.FC = () => (
  <footer className="app-footer">
    <IonText color="medium">
      <div className="app-footer__inner">
        <div>
          <p className="app-footer__brand">URL 2 STL</p>
          <p className="app-footer__copy">Free QR maker for auto URL conversion to print-ready STL or OBJ 3D model exports.</p>
        </div>
        <div className="app-footer__meta">
          <a href="/#/features">Features</a>
          <a href="/#/faq">FAQ</a>
          <a href="/#/guides">Guides</a>
          <a href="/#/terms">Terms &amp; Conditions</a>
          <span className="footer-version">v{APP_VERSION} build {BUILD_NUMBER}</span>
          <span>© {YEAR} All rights reserved.</span>
        </div>
      </div>
    </IonText>
  </footer>
);

export default AppFooter;
