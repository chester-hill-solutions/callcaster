const SupportButton = ({ option, handleChange, current }) => {
    return (
      <button
      style={{width:"48%"}}
        key={option.value}
        className={`support-button button ${current === option.value ? 'selected' : ''}`}
        onClick={() => handleChange(option.value)}
      >
        {option.label}
      </button>
    );
  };
  
  export default SupportButton;
  