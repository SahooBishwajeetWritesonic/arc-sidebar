import { memo } from 'react';
import { Favicon } from '@/app/rows/Favicon';
import { Row } from '@/app/rows/Row';
import { Title } from '@/app/rows/Title';
import { openUrl } from '@/state/tabs';

export const GITHUB_SIGN_IN = 'https://github.com/login';

/** First in a Live Folder when GitHub says nobody is signed in: opens GitHub's sign-in page. */
export const SignInRow = memo(function SignInRow({
  folderId,
  depth,
}: {
  folderId: string;
  depth: number;
}) {
  return (
    <Row
      kind="link"
      id={GITHUB_SIGN_IN}
      depth={depth}
      parentId={folderId}
      onTap={() => openUrl(GITHUB_SIGN_IN)}
    >
      <Favicon url={GITHUB_SIGN_IN} />
      <Title text="Sign in to GitHub" />
    </Row>
  );
});
