import React from "react";

export const dynamic = "force-dynamic";

const MainLayout = ({ children }) => {
  return <div className="container mx-auto my-12">{children}</div>;
};

export default MainLayout;
