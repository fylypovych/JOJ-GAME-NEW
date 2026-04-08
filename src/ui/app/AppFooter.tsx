interface AppFooterProps {
  buildLabel: string;
}

export const AppFooter = (props: AppFooterProps) => {
  const { buildLabel } = props;

  return (
    <footer className="app-footer">
      &copy; ALL RIGHTS RESERVED BY &quot;SOHODNY LLC,{' '}
      <a href="mailto:zhurnal.zhurnaliv@gmail.com">zhurnal.zhurnaliv@gmail.com</a>
      {buildLabel ? ` · ${buildLabel}` : ''}
    </footer>
  );
};
