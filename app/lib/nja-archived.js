const makeCall = async () => {
    if (device) {
      device.audio.setAudioConstraints({
        echoCancellation: true,
        autoGainControl: true,
        noiseSupression: true,
      });
      try {
        console.log(`Attempting call to ${to}.`);
        let call = await device.connect({
          params: {
            To: to,
          },
        });
        setCall(call);
      } catch (err) {
        setError(error);
      }
    }
  };
  const makeRoboCall = async () => {
    await fetch(`${env.BASE_URL}/api/call/robocall`, {
      method: "POST",
      body: JSON.stringify({ to }),
    });
  };
  const makeVoiceDrop = async () => {
    await fetch(`${env.BASE_URL}/api/call/audiodrop`, {
      method: "POST",
      body: JSON.stringify({ to }),
    });
  };
  const hangUp = () => {
    if (mediaStreamSource.current && processor.current) {
      processor.current.disconnect();
      mediaStreamSource.current.disconnect();
      processor.current = null;
      mediaStreamSource.current = null;
    }
    device.disconnectAll();
  };
  const sendMessage = async () => {
    console.log("Sending");
    await fetch(`${env.BASE_URL}/api/message`, {
      method: "POST",
      body: JSON.stringify({ to, messageBody }),
    });
  };