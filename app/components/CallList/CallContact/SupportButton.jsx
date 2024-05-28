const SupportButton = ({ option, handleChange, current }) => {
  return (
    <button
      style={{ width: "35%", fontSize:'small', border:"2px solid #333", borderRadius:"30px", background: current === option.value ? 'hsl(var(--primary))' : 'unset' }}
      key={option.value}
      className={`support-button button ${current === option.value ? 'selected' : ''}`}
      onClick={() => handleChange(option.value)}
    >
      {option.label}
    </button>
  );
};

export default SupportButton;
