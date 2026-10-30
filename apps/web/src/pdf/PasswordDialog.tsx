import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
} from '@fluentui/react-components';
import { useEffect, useState } from 'react';
import { type PasswordRequest, usePasswordPrompt } from './passwordPrompt';

/** Asks for a protected PDF's password (R6). Mounted only while asking: a mounted Dialog adds focus sentinels. */
export function PasswordDialog() {
  const request = usePasswordPrompt((s) => s.request);
  return request === null ? null : <PasswordForm request={request} />;
}

function PasswordForm({ request }: { readonly request: PasswordRequest }) {
  const dismiss = usePasswordPrompt((s) => s.dismiss);
  const attempt = usePasswordPrompt((s) => s.attempt);
  const cancel = () => {
    dismiss();
    request.cancel();
  };
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Each attempt starts empty. The dialog itself stays mounted across attempts: remounting a modal makes
  // Tabster hide the page behind it twice and restore it once.
  useEffect(() => {
    setPassword('');
  }, [attempt]);

  const submit = () => {
    setBusy(true);
    void request.submit(password).finally(() => {
      setBusy(false);
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) cancel();
      }}
    >
      <DialogSurface>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody>
            <DialogTitle>Password for “{request.fileName}”</DialogTitle>
            <DialogContent>
              <Field
                label="Password"
                validationState={request.wrong ? 'error' : 'none'}
                validationMessage={request.wrong ? 'The password is not correct.' : null}
                hint="Used only to open the PDF on this device; it is not saved."
              >
                <Input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(_, data) => {
                    setPassword(data.value);
                  }}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" type="submit" disabled={busy || password === ''}>
                Open
              </Button>
              <Button onClick={cancel}>Cancel</Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}
