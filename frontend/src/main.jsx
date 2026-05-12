import React from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./styles.css";
import { App } from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Theme accentColor="pink" grayColor="sand" radius="large" scaling="95%">
      <App />
    </Theme>
  </React.StrictMode>
);
