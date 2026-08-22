interface AppFooterProps {
  buildLabel: string;
}

export const AppFooter = (props: AppFooterProps) => {
  const { buildLabel } = props;

  return (
    <footer className="app-footer">
      &copy; ALL RIGHTS RESERVED BY &quot;
      <a href="https://sohodny-usa.com">SOHODNY LLC</a>&quot; 2026,{' '}
      <a href="mailto:zhurnal.zhurnaliv@gmail.com">zhurnal.zhurnaliv@gmail.com</a>
      {buildLabel ? ` · ${buildLabel}` : ''}
    </footer>
  );
};
